"""Bounded media preparation for the entrepreneur assistant; no remote file URLs."""
import base64
import binascii
import io
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import warnings
import zipfile
from fastapi import HTTPException
from PIL import Image,ImageOps,UnidentifiedImageError

MAX_FILE=8*1024*1024
MAX_TOTAL=16*1024*1024
MAX_VIDEO_SECONDS=90
MAX_AUDIO_SECONDS=180
MEDIA_SLOTS=threading.BoundedSemaphore(2)

def data_url(raw,mime):return 'data:'+mime+';base64,'+base64.b64encode(raw).decode()

def image_block(raw):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.width*source.height>24_000_000:raise HTTPException(413,'Photo trop grande : 24 mégapixels maximum.')
                image=ImageOps.exif_transpose(source).convert('RGBA');image.thumbnail((1280,1280))
                white=Image.new('RGBA',image.size,'white');white.alpha_composite(image)
                out=io.BytesIO();white.convert('RGB').save(out,format='JPEG',quality=82)
        return {'type':'input_image','image_url':data_url(out.getvalue(),'image/jpeg'),'detail':'auto'}
    except HTTPException:raise
    except (OSError,ValueError,UnidentifiedImageError,Image.DecompressionBombError,Image.DecompressionBombWarning):raise HTTPException(422,'Photo illisible : utilisez JPEG, PNG ou WebP.')

def decoded_files(files):
    result=[];total=0
    for item in files:
        try:raw=base64.b64decode(item.data,validate=True)
        except (ValueError,binascii.Error):raise HTTPException(422,'Pièce jointe illisible.')
        total+=len(raw)
        if not raw:raise HTTPException(422,'Une pièce jointe est vide.')
        if len(raw)>MAX_FILE or total>MAX_TOTAL:raise HTTPException(413,'8 Mo par fichier et 16 Mo au total maximum.')
        name=Path(item.name.replace('\\','/')).name[:180] or 'document'
        result.append((name,raw))
    return result

def run_media(args,timeout=25):
    try:
        result=subprocess.run(args,capture_output=True,timeout=timeout)
        if result.returncode:raise HTTPException(422,'Média illisible ou format non pris en charge.')
        return result.stdout
    except subprocess.TimeoutExpired:raise HTTPException(422,'Média trop complexe : envoyez un extrait plus court.')

def _prepare_file(name,raw):
    """Return provider blocks, display metadata, optional audio to transcribe."""
    ext=Path(name).suffix.lower();meta={'name':name,'kind':'document'}
    if ext in {'.jpg','.jpeg','.png','.webp','.gif','.heic','.heif'}:
        return [image_block(raw)],{**meta,'kind':'image'},None
    if ext=='.pdf':
        if not raw.startswith(b'%PDF-'):raise HTTPException(422,'Le fichier n’est pas un PDF valide.')
        try:
            from pypdf import PdfReader
            reader=PdfReader(io.BytesIO(raw))
            if reader.is_encrypted:raise HTTPException(422,'Retirez le mot de passe du PDF avant de l’envoyer.')
            if not 1<=len(reader.pages)<=20:raise HTTPException(413,'20 pages maximum par PDF.')
        except HTTPException:raise
        except Exception:raise HTTPException(422,'PDF illisible.')
        return [{'type':'input_file','filename':name,'file_data':data_url(raw,'application/pdf')}],meta,None
    office={'.docx':('word/document.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.document'),'.xlsx':('xl/workbook.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),'.pptx':('ppt/presentation.xml','application/vnd.openxmlformats-officedocument.presentationml.presentation')}
    if ext in office:
        member,mime=office[ext]
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                if member not in z.namelist() or sum(i.file_size for i in z.infolist())>32*1024*1024:raise ValueError()
        except (ValueError,zipfile.BadZipFile):raise HTTPException(422,'Document bureautique illisible ou trop volumineux.')
        return [{'type':'input_file','filename':name,'file_data':data_url(raw,mime)}],meta,None
    if ext in {'.txt','.csv','.tsv','.md'}:
        try:text=raw.decode('utf-8-sig')
        except UnicodeDecodeError:raise HTTPException(422,'Enregistrez ce texte en UTF-8.')
        if len(text)>100000:raise HTTPException(413,'100 000 caractères maximum par document texte.')
        if '\x00' in text:raise HTTPException(422,'Document texte invalide.')
        return [{'type':'input_text','text':f'Document joint : {name}\n<document>\n{text}\n</document>'}],meta,None
    if ext not in {'.mp4','.mov','.webm','.m4a','.mp3','.wav','.ogg','.flac'}:raise HTTPException(415,'Formats : photos JPEG/PNG/WebP, PDF, DOCX, XLSX, PPTX, TXT, CSV et médias MP4/MOV/WebM/MP3/M4A/WAV/OGG/FLAC.')
    media_magic=raw.startswith((b'RIFF',b'ID3',b'OggS',b'fLaC',b'\x1aE\xdf\xa3')) or raw[:2] in (b'\xff\xfb',b'\xff\xf3',b'\xff\xf2') or raw[4:8] in (b'ftyp',b'moov',b'mdat',b'wide',b'free')
    if not media_magic:raise HTTPException(422,'Le fichier ne contient pas un média reconnu.')
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):raise HTTPException(503,'L’analyse audio/vidéo est indisponible sur ce serveur.')
    with tempfile.TemporaryDirectory(prefix='aia-chat-media-') as folder:
        source=Path(folder)/('source'+ext);source.write_bytes(raw)
        probe=run_media(['ffprobe','-v','error','-protocol_whitelist','file,pipe','-show_entries','format=duration:stream=codec_type','-of','json',str(source)],10)
        try:
            info=json.loads(probe);streams={s['codec_type'] for s in info.get('streams',[])}
            duration=float(info.get('format',{}).get('duration',0))
        except (ValueError,KeyError,TypeError):raise HTTPException(422,'Durée du média impossible à lire.')
        video='video' in streams;audio='audio' in streams
        limit=MAX_VIDEO_SECONDS if video else MAX_AUDIO_SECONDS
        if not video and not audio:raise HTTPException(422,'Aucune piste audio ou vidéo reconnue.')
        blocks=[]
        base=['ffmpeg','-nostdin','-v','error','-threads','1','-filter_threads','1','-protocol_whitelist','file,pipe','-i',str(source)]
        # Browser MediaRecorder WebM files often omit a duration header.
        if duration==0:
            progress=run_media(base+['-t',str(limit+1),'-progress','pipe:1','-f','null','-'])
            import re
            times=re.findall(rb'out_time_us=(\d+)',progress)
            duration=max((int(t)/1_000_000 for t in times),default=0)
        if not math.isfinite(duration) or not 0<duration<=limit:raise HTTPException(413,f'Envoyez un extrait de {limit} secondes maximum.')
        if video:
            run_media(base+['-t',str(limit),'-an','-vf',f'fps=1/{max(duration/6,.1)},scale=960:-2','-frames:v','6',str(Path(folder)/'frame-%02d.jpg')])
            frames=sorted(Path(folder).glob('frame-*.jpg'))
            if not frames:raise HTTPException(422,'Aucune image exploitable dans cette vidéo.')
            blocks.append({'type':'input_text','text':f'Vidéo {name} ({duration:.1f} s), analyse de {len(frames)} images échantillonnées dans l’ordre chronologique ; ne pas prétendre avoir vu chaque instant.'})
            blocks.extend(image_block(p.read_bytes()) for p in frames)
            meta.update(kind='video',seconds=duration,detail=f'{len(frames)} images analysées sur {duration:.0f} s')
        else:meta.update(kind='audio',seconds=duration,detail=f'{duration:.0f} s')
        audio_raw=run_media(base+['-t',str(limit),'-vn','-ac','1','-ar','16000','-f','wav','pipe:1']) if audio else None
        return blocks,meta,audio_raw


def prepare_file(name,raw):
    if not MEDIA_SLOTS.acquire(blocking=False):raise HTTPException(429,'Le serveur analyse déjà des fichiers. Réessayez dans un instant.')
    try:return _prepare_file(name,raw)
    finally:MEDIA_SLOTS.release()
