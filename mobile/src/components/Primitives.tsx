import { ActivityIndicator, Pressable, StyleSheet, Text, type TextProps, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, type Tone } from '../theme';
import { Icon } from './Icon';
import type { IconName } from '../models';

export function Copy({ style, weight = 'medium', ...props }: TextProps & { weight?: keyof typeof theme.fonts }) {
  return <Text {...props} style={[s.copy, { fontFamily: theme.fonts[weight] }, style]}/>;
}
export function Glass({ children, tone, style, radius = theme.radius.card }: { children: React.ReactNode; tone?: Tone; style?: StyleProp<ViewStyle>; radius?: number }) {
  return <LinearGradient colors={theme.glass} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.glass, { borderRadius: radius }, style]}>
    {tone && <LinearGradient pointerEvents="none" colors={['transparent', `${theme.colors[tone]}80`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.rim}/>}
    {children}
  </LinearGradient>;
}
export function Button({ title, onPress, busy, secondary, disabled, testID }: { title: string; onPress: () => void; busy?: boolean; secondary?: boolean; disabled?: boolean; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, pressed && s.pressed, (busy || disabled) && s.disabled]}>
    {busy ? <ActivityIndicator color={secondary ? theme.colors.blue : theme.colors.background}/> : <Copy weight="extra" style={[s.buttonText, secondary && { color: theme.colors.blue }]}>{title}</Copy>}
  </Pressable>;
}
export function IconButton({ name, label, onPress }: { name: IconName; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.iconButton, pressed && s.pressed]}><Icon name={name} size={19} color={theme.colors.muted}/></Pressable>;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <Glass style={s.empty}><Icon name="check" color={theme.colors.green}/><Copy style={s.emptyText}>{children}</Copy></Glass>;
}
const s = StyleSheet.create({
  copy: { color: theme.colors.text, fontSize: 14, lineHeight: 21 },
  glass: { borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', padding: theme.spacing.card },
  rim: { position: 'absolute', top: 0, left: 14, right: 14, height: 1 },
  button: { minHeight: theme.size.button, borderRadius: theme.radius.button, backgroundColor: theme.colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, paddingVertical: 12 },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.blue },
  buttonText: { color: theme.colors.background, fontSize: 15, textAlign: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
  iconButton: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 14 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12 }, emptyText: { flex: 1 },
});
