import { StyleSheet, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';

import { palette } from '@/constants/theme';

/**
 * Entry route. Renders a neutral loading screen while the root layout's auth
 * guard determines where to send the user (login, pending-verification, or the
 * role home). Intentionally has no navigation logic of its own.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={palette.steelBlue} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.navyDeep,
  },
});
