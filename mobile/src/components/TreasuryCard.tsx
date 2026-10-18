import { Pressable, StyleSheet, View } from 'react-native';
import { Copy, Glass } from './Primitives';
import { IconTile } from './Icon';
import { euro, type HomeData } from '../models';
import { theme } from '../theme';
export function TreasuryCard({ data, onPress }: { data: HomeData; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Trésorerie : ${euro(data.balance)}. Voir les mouvements`} onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>
    <Glass tone="gold" style={s.card}><View style={s.head}><IconTile name="layers" tone="gold"/><View style={s.balance}><Copy weight="extra" style={s.label}>TRÉSORERIE</Copy><Copy weight="extra" style={s.amount}>{euro(data.balance)}</Copy></View></View>
      <View style={s.row}><View style={s.mini}><Copy style={s.muted}>À encaisser</Copy><Copy weight="extra" style={[s.value, { color: theme.colors.green }]}>{euro(data.receivable)}</Copy></View><View style={s.mini}><Copy style={s.muted}>À payer</Copy><Copy weight="extra" style={s.value}>{euro(data.payable)}</Copy></View></View>
    </Glass>
  </Pressable>;
}
const s = StyleSheet.create({ card: { gap: 18, padding: 20 }, head: { flexDirection: 'row', alignItems: 'center', gap: 14 }, balance: { flex: 1 }, label: { color: theme.colors.muted, letterSpacing: 1 }, amount: { fontSize: 36, lineHeight: 45, letterSpacing: -1 }, row: { flexDirection: 'row', gap: 12 }, mini: { flex: 1, backgroundColor: 'rgba(0,0,0,0.34)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.045)', borderRadius: 15, padding: 13, gap: 4 }, muted: { color: theme.colors.muted }, value: { fontSize: 20, lineHeight: 28 } });
