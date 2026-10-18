import { Pressable, StyleSheet, View } from 'react-native';
import { Copy, Glass, Button } from './Primitives';
import { IconTile, Icon } from './Icon';
import { selectModules, type Module } from '../models';
import type { Columns } from '../preferences';
import { theme } from '../theme';
export function ModuleGrid({ modules, columns, width, onSettings, onModule, onAll }: { modules: Module[]; columns: Columns; width: number; onSettings: () => void; onModule: (module: Module) => void; onAll: () => void }) {
  const shown = selectModules(modules, columns);
  const cellWidth = (width - theme.spacing.gap * (columns - 1)) / columns;
  return <View style={s.section}><View style={s.heading}><Copy weight="extra" accessibilityRole="header" style={s.title}>Vos modules</Copy><Pressable onPress={onSettings} accessibilityRole="button" accessibilityLabel={`Choisir la grille, actuellement ${columns} colonnes`} style={s.settings}><Icon name="settings" size={18} color={theme.colors.muted}/><Copy style={s.label}>Grille · {columns}</Copy></Pressable></View>
    <View style={s.grid}>{shown.map(module => <ModuleTile key={module.id} module={module} width={cellWidth} columns={columns} onPress={() => onModule(module)}/>)}</View>
    <Button title="Tous les modules" secondary onPress={onAll}/>
  </View>;
}
function ModuleTile({ module, width, columns, onPress }: { module: Module; width: number; columns: Columns; onPress: () => void }) {
  const compact = columns === 4;
  const height = compact ? width : columns === 3 ? 114 : 134;
  return <Pressable testID={`module-${module.id}`} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${module.name}, ${module.count} élément${module.count > 1 ? 's' : ''}`} style={({ pressed }) => [{ width }, pressed && { opacity: 0.7 }]}>
    <Glass radius={theme.radius.module} tone={module.tone} style={[s.tile, { height, padding: compact ? 10 : 14 }]}><View style={s.tileTop}><IconTile name={module.icon} tone={module.tone} size={40}/><Copy weight="bold" style={[s.count, { color: theme.colors[module.tone] }, compact && s.compactCount]}>{module.count}</Copy></View>{!compact && <Copy weight="bold" style={s.name}>{module.name}</Copy>}</Glass>
    {compact && <Copy weight="semibold" style={s.compactName}>{module.name}</Copy>}
  </Pressable>;
}
const s = StyleSheet.create({ section: { gap: 14 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 18, lineHeight: 25 }, settings: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 8 }, label: { color: theme.colors.muted }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.gap }, tile: { justifyContent: 'space-between' }, tileTop: { flexDirection: 'row', justifyContent: 'space-between', position: 'relative', gap: 2 }, count: { fontSize: 14, lineHeight: 20 }, compactCount: { position: 'absolute', top: -7, right: -5, backgroundColor: theme.colors.surface, minWidth: 16, textAlign: 'center', borderRadius: 8 }, name: { fontSize: 14, lineHeight: 20 }, compactName: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 7, minHeight: 40 } });
