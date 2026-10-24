import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { HomeHeader } from './components/HomeHeader';
import { TreasuryCard } from './components/TreasuryCard';
import { ActionCard } from './components/ActionCard';
import { SectorCard } from './components/SectorCard';
import { ModuleGrid } from './components/ModuleGrid';
import { ContextPanel } from './components/ContextPanel';
import { Button, Copy, Empty, Glass } from './components/Primitives';
import { Icon } from './components/Icon';
import { usePreferences, type Columns } from './preferences';
import { demo } from './demo';
import { euro, selectActions, type Action, type Module } from './models';
import { theme } from './theme';

type Panel = { kind: 'settings' | 'treasury' | 'sector' | 'all' | 'assistant' } | { kind: 'action'; action: Action } | { kind: 'module'; module: Module };
export default function HomeScreen() {
  const preferences = usePreferences();
  const [width, setWidth] = useState(350);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [hidden, setHidden] = useState(new Set<string>());
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const actions = selectActions(demo.actions, hidden);
  function close() { if (!busy) { setPanel(null); setConfirming(false); } }
  function open(next: Panel) { setConfirming(false); setPanel(next); }
  function hide(action: Action, snooze: boolean) {
    setHidden(current => new Set([...current, action.id]));
    setNotice(snooze ? 'Action reportée dans cette démonstration.' : 'Action masquée dans cette démonstration.');
  }
  async function saveColumns(columns: Columns) {
    try { if (await preferences.choose(columns)) setNotice('Grille sauvegardée. Le réglage précédent reste disponible.'); }
    catch { setNotice('Impossible de sauvegarder. Votre réglage précédent est conservé.'); }
  }
  async function restore() {
    try { if (await preferences.restore()) setNotice('Le réglage précédent a été rétabli.'); }
    catch { setNotice('Impossible de rétablir le réglage. Réessayez.'); }
  }
  async function simulate(action: Action, label: string) {
    if (busy) return;
    setBusy(true);
    await new Promise(resolve => setTimeout(resolve, 400));
    setBusy(false); setPanel(null); setConfirming(false);
    setHidden(current => new Set([...current, action.id]));
    setNotice(`Simulation terminée : ${label}. Aucun envoi ni achat réel.`);
  }
  if (!preferences.ready) return <SafeAreaView style={s.root}><ActivityIndicator color={theme.colors.green} accessibilityLabel="Chargement des préférences"/></SafeAreaView>;
  const titles = { settings: 'Personnaliser l’accueil', treasury: 'Vos mouvements', sector: 'Votre lecture en 30 s', all: 'Tous les modules', assistant: 'Assistant IA', action: 'Vérifier avant de valider', module: panel?.kind === 'module' ? panel.module.name : '' };
  return <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
    <StatusBar style="light"/>
    <ScrollView testID="home-scroll" contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.content} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        <HomeHeader firstName={demo.firstName} count={actions.length} onAssistant={() => open({ kind: 'assistant' })}/>
        <TreasuryCard data={demo} onPress={() => open({ kind: 'treasury' })}/>
        <View style={s.section}><Copy weight="extra" accessibilityRole="header" style={s.sectionTitle}>À faire maintenant</Copy>{actions.length ? actions.map(action => <ActionCard key={action.id} action={action} onOpen={() => open({ kind: 'action', action })} onDismiss={() => hide(action, false)} onSnooze={() => hide(action, true)}/>) : <Empty>Tout est à jour. Vous pouvez souffler.</Empty>}</View>
        <SectorCard title={demo.insight.title} onPress={() => open({ kind: 'sector' })}/>
        <ModuleGrid modules={demo.modules} columns={preferences.current.columns} width={width} onSettings={() => open({ kind: 'settings' })} onModule={module => open({ kind: 'module', module })} onAll={() => { setQuery(''); open({ kind: 'all' }); }}/>
        <View style={s.footer}><Copy style={s.muted}>Aperçu · données de démonstration</Copy>{hidden.size > 0 && <Button title="Revoir les actions de démonstration" secondary onPress={() => { setHidden(new Set()); setNotice('Les actions de démonstration sont rétablies.'); }}/>}</View>
      </View>
    </ScrollView>
    {!!notice && <View style={s.notice} accessibilityLiveRegion="polite"><Copy style={s.noticeText}>{notice}</Copy><Pressable accessibilityRole="button" accessibilityLabel="Fermer la confirmation" style={s.noticeClose} onPress={() => setNotice('')}><Icon name="x" size={18}/></Pressable></View>}
    {panel && <ContextPanel title={titles[panel.kind]} onClose={close}>
      {panel.kind === 'settings' && <>
        <Copy>Choisissez le nombre de colonnes. Les couleurs et les arrondis restent identiques.</Copy>
        <View style={s.options}>{([2, 3, 4] as Columns[]).map(columns => <Pressable key={columns} accessibilityRole="radio" accessibilityState={{ checked: preferences.current.columns === columns, disabled: preferences.saving }} accessibilityLabel={`${columns} colonnes`} disabled={preferences.saving} onPress={() => saveColumns(columns)} style={[s.option, preferences.current.columns === columns && s.selected]}><Copy weight="extra" style={s.optionNumber}>{columns}</Copy><Copy>colonnes</Copy></Pressable>)}</View>
        <Copy style={s.muted}>Votre choix est mémorisé sur cet appareil. L’ancien réglage est conservé à chaque modification.</Copy>
        <Button title="Revenir au réglage précédent" secondary disabled={!preferences.previous || preferences.saving} busy={preferences.saving} onPress={restore}/>
      </>}
      {panel.kind === 'treasury' && <>
        <Copy style={s.muted}>Exemple de trésorerie · euros</Copy>
        <Copy weight="extra" style={s.big}>{euro(demo.balance)} disponibles</Copy>
        <Glass><Copy>À encaisser : {euro(demo.receivable)}</Copy><Copy>À payer : {euro(demo.payable)}</Copy></Glass>
        <Copy>Les mouvements réels seront raccordés après validation de cet écran.</Copy>
      </>}
      {panel.kind === 'sector' && <><Copy weight="bold" style={s.sectionTitle}>{demo.insight.title}</Copy><Copy>{demo.insight.summary}</Copy></>}
      {panel.kind === 'all' && <>
        <TextInput accessibilityLabel="Rechercher un module" placeholder="Rechercher un module" placeholderTextColor={theme.colors.muted} value={query} onChangeText={setQuery} style={s.input}/>
        {demo.modules.filter(module => module.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))).map(module => <Pressable key={module.id} accessibilityRole="button" onPress={() => open({ kind: 'module', module })} style={s.moduleRow}><Copy weight="bold">{module.name}</Copy><Copy style={s.muted}>{module.count}</Copy><Icon name="chevron" color={theme.colors.blue} size={18}/></Pressable>)}
        {!demo.modules.some(module => module.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))) && <Copy>Aucun résultat. Essayez un autre mot.</Copy>}
      </>}
      {panel.kind === 'module' && <><Copy>{panel.module.count ? `${panel.module.count} élément${panel.module.count > 1 ? 's' : ''} dans cet exemple.` : 'Tout est à jour dans ce module.'}</Copy><Copy style={s.muted}>Cet aperçu présente l’accueil. Le module sera relié à vos données lors de l’étape suivante.</Copy></>}
      {panel.kind === 'assistant' && <>
        <Copy>Que souhaitez-vous préparer ?</Copy><TextInput accessibilityLabel="Votre question à l’assistant" multiline placeholder="Écrivez votre question…" placeholderTextColor={theme.colors.muted} value={draft} onChangeText={setDraft} style={[s.input, { minHeight: 110 }]}/>
        <Copy style={s.muted}>Votre brouillon est conservé tant que l’application reste ouverte. La réponse IA et la saisie vocale seront ajoutées à l’étape 4.</Copy>
      </>}
      {panel.kind === 'action' && <>
        <Copy weight="bold" style={s.sectionTitle}>{panel.action.title}</Copy>
        <Copy style={s.muted}>Démonstration · aucune opération réelle</Copy>
        {panel.action.kind === 'quote' && <><Glass><Copy>Client : Entreprise Dupont</Copy><Copy>Prestation : entretien des locaux</Copy><Copy weight="extra">Montant à contrôler : {euro(1200)}</Copy></Glass><Copy>{confirming ? 'Confirmez-vous cette simulation d’envoi au client ?' : 'Contrôlez le client et le montant avant de continuer.'}</Copy><Button title={confirming ? 'Confirmer la simulation d’envoi' : 'Montant vérifié, continuer'} busy={busy} onPress={() => confirming ? simulate(panel.action, 'devis validé') : setConfirming(true)}/></>}
        {panel.action.kind === 'equipment' && <><Glass><Copy weight="bold">Escabeau professionnel · 5 marches</Copy><Copy>Fournisseur et tarif à sélectionner</Copy></Glass><Copy>{confirming ? 'Confirmez-vous l’ouverture de cette commande de démonstration ?' : 'Exemple de modèle. Aucun fournisseur ni prix réel n’est engagé.'}</Copy><Button title={confirming ? 'Confirmer la simulation de commande' : 'Choisir ce modèle'} busy={busy} onPress={() => confirming ? simulate(panel.action, 'commande préparée') : setConfirming(true)}/></>}
        {panel.action.kind === 'document' && <><Glass><Copy weight="bold">Facture fournisseur · exemple</Copy><Copy>Type détecté : facture</Copy><Copy>Montant : 85 €</Copy></Glass><Copy>Le document et sa détection sont fictifs dans cet aperçu.</Copy><Button title="Simuler le classement" busy={busy} onPress={() => simulate(panel.action, 'document classé')}/><Button title={confirming ? 'Confirmer la suppression simulée' : 'Supprimer cet exemple'} secondary busy={busy} onPress={() => confirming ? simulate(panel.action, 'document supprimé') : setConfirming(true)}/></>}
      </>}
    </ContextPanel>}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background }, scroll: { paddingHorizontal: theme.spacing.side, paddingTop: 24, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 550, alignSelf: 'center', gap: theme.spacing.block }, section: { gap: 14 }, sectionTitle: { fontSize: 18, lineHeight: 25 },
  footer: { alignItems: 'center', gap: 12 }, muted: { color: theme.colors.muted }, big: { fontSize: 28, lineHeight: 38 },
  options: { flexDirection: 'row', gap: 10 }, option: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.button, minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 5 }, selected: { borderColor: theme.colors.green, backgroundColor: 'rgba(74,222,128,0.08)' }, optionNumber: { fontSize: 24, lineHeight: 30 },
  input: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, padding: 14, color: theme.colors.text, fontFamily: theme.fonts.medium, fontSize: 15, minHeight: 48, backgroundColor: theme.colors.background, textAlignVertical: 'top' },
  moduleRow: { flexDirection: 'row', minHeight: 48, alignItems: 'center', gap: 15, justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 10 },
  notice: { marginHorizontal: 20, marginBottom: 12, backgroundColor: '#18251F', borderWidth: 1, borderColor: '#4ADE8060', borderRadius: 16, paddingLeft: 16, flexDirection: 'row', alignItems: 'center', maxWidth: 550, alignSelf: 'stretch' }, noticeText: { flex: 1, paddingVertical: 12 }, noticeClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
