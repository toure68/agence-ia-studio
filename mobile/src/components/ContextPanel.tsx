import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Copy, IconButton } from './Primitives';
import { theme } from '../theme';
export function ContextPanel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <SafeAreaView style={s.overlay}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.keyboard}><View style={s.panel} accessibilityViewIsModal><View style={s.heading}><Copy weight="extra" accessibilityRole="header" style={s.title}>{title}</Copy><IconButton name="x" label="Fermer le panneau" onPress={onClose}/></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>{children}<Button title="Fermer" secondary onPress={onClose}/></ScrollView></View></KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
const s = StyleSheet.create({ overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 }, keyboard: { maxHeight: '94%', width: '100%', maxWidth: 550, alignSelf: 'center' }, panel: { maxHeight: '100%', backgroundColor: '#11151C', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 24, overflow: 'hidden', flexShrink: 1 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border, minHeight: 65 }, title: { fontSize: 19, lineHeight: 26, flex: 1 }, body: { padding: 20, gap: 16 } });
