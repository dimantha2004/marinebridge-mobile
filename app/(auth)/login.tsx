import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import {
  ActivityIndicator,
  Button,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

import { fonts, palette, radius, spacing } from '@/constants/theme';
import { signIn } from '@/lib/auth';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  const onSignIn = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await signIn(username.trim(), password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message || 'Unable to sign in. Check your credentials.');
      return;
    }
    // On success the root auth guard routes the user to their role home.
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.logoBadge}>
            <Ionicons name="boat" size={34} color={palette.fogWhite} />
          </View>
          <Text style={styles.title}>Marianbridge</Text>
          <Text style={styles.subtitle}>Maritime provisioning, coordinated.</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            mode="outlined"
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="username"
            textContentType="username"
            left={<TextInput.Icon icon="account-outline" />}
            style={styles.input}
            disabled={submitting}
          />
          <TextInput
            mode="outlined"
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            textContentType="password"
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onPress={() => setShowPassword((v) => !v)}
              />
            }
            style={styles.input}
            disabled={submitting}
            onSubmitEditing={onSignIn}
          />

          <Button
            mode="contained"
            onPress={onSignIn}
            disabled={!canSubmit}
            style={styles.submit}
            contentStyle={styles.submitContent}
          >
            {submitting ? (
              <ActivityIndicator size={18} color={palette.fogWhite} />
            ) : (
              'Sign In'
            )}
          </Button>

          <View style={styles.registerRow}>
            <Text style={styles.muted}>New to Marianbridge? </Text>
            <Link href="/(auth)/register" style={styles.link}>
              <Text style={styles.linkText}>Create an account</Text>
            </Link>
          </View>
        </View>
      </ScrollView>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError(null)}
        duration={5000}
        style={styles.snackbar}
        action={{ label: 'Dismiss', onPress: () => setError(null) }}
      >
        {error}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.navyDeep },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: palette.oceanMid,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.steelBlue,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    letterSpacing: 4,
    color: palette.fogWhite,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: palette.hullGray,
    marginTop: spacing.xs,
  },
  form: { gap: spacing.md },
  input: { backgroundColor: palette.oceanMid },
  submit: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
  },
  submitContent: { height: 48 },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  muted: {
    fontFamily: fonts.body,
    color: palette.hullGray,
  },
  link: {},
  linkText: {
    fontFamily: fonts.bodySemiBold,
    color: palette.steelBlue,
  },
  snackbar: { backgroundColor: palette.oceanMid },
});
