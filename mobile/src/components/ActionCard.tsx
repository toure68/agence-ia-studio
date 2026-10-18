import { StyleSheet, View } from 'react-native';
import { Copy, Glass, Button, IconButton } from './Primitives';
import { IconTile } from './Icon';
import type { Action } from '../models';
import { theme } from '../theme';
export function ActionCard({ action, onOpen, onDismiss, onSnooze }: { action: Action; onOpen: () => void; onDismiss: () => void; onSnooze: () => void }) {
  return <Glass tone={action.tone} style={s.card}>
    <View style={s.top}><IconTile name={action.icon} tone={action.tone}/><View style={s.heading}><Copy weight="bold" style={s.title}>{action.title}</Copy>{action.important && <View style={s.badge}><Copy weight="bold" style={s.important}>Important</Copy></View>}</View></View>
    <Copy style={s.description}>{action.description}</Copy>
    <Button title={action.button} onPress={onOpen}/>
    <View style={s.tools}><Copy style={s.toolsLabel}>Cette action</Copy><IconButton name="clock" label={`Reporter : ${action.title}`} onPress={onSnooze}/><IconButton name="x" label={`Masquer : ${action.title}`} onPress={onDismiss}/></View>
  </Glass>;
}
const s = StyleSheet.create({ card: { gap: 14, paddingBottom: 8 }, top: { flexDirection: 'row', alignItems: 'center', gap: 14 }, heading: { flex: 1, gap: 6 }, title: { fontSize: 18, lineHeight: 23 }, badge: { alignSelf: 'flex-start', backgroundColor: 'rgba(226,176,74,0.16)', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 16 }, important: { color: theme.colors.gold, lineHeight: 20 }, description: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 }, tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: -8 }, toolsLabel: { color: theme.colors.muted, marginRight: 4 } });
