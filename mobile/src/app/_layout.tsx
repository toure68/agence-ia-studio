import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { ActivityIndicator, View } from 'react-native';
import { Copy } from '../components/Primitives';
import { theme } from '../theme';
export default function RootLayout() {
  const [loaded, error] = useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  if (!loaded && !error) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}><ActivityIndicator color={theme.colors.green}/></View>;
  if (error) return <View style={{ flex: 1, padding: 20, justifyContent: 'center', backgroundColor: theme.colors.background }}><Copy>Impossible de charger la police. Fermez puis rouvrez l’application.</Copy></View>;
  return <SafeAreaProvider><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background } }}/></SafeAreaProvider>;
}
