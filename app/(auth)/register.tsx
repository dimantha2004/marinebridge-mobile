import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Button,
  Menu,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

import { fonts, palette, radius, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { signUp } from '@/lib/auth';
import type { UserRole } from '@/types/database';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'captain', label: 'Captain' },
  { value: 'charter_party', label: 'Charter Party' },
  { value: 'ship_agent', label: 'Ship Agent' },
  { value: 'supplier', label: 'Supplier' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RoleField {
  key: string;
  label: string;
  icon: string;
  required: boolean;
  type?: string;
  options?: { value: string; label: string }[];
}

const ROLE_FIELDS: Record<UserRole, RoleField[]> = {
  captain: [
    { key: 'passport_no', label: 'Passport No', icon: 'card-account-details-outline', required: true },
    { key: 'sid_no', label: 'SID No', icon: 'identifier', required: true },
  ],
  charter_party: [
    { key: 'cp_no', label: 'CP (Charterparty) No', icon: 'file-document-outline', required: true },
    { key: 'imo_no', label: 'IMO No', icon: 'ferry', required: true },
    { key: 'contract_date', label: 'Contract Date', icon: 'calendar-outline', required: true },
  ],
  ship_agent: [
    { key: 'agent_type', label: 'Agent Type', icon: 'card-account-details-outline', required: true, type: 'select', options: [{ value: 'liner', label: 'Liner Shipping Agent' }, { value: 'tramp', label: 'Tramp Shipping Agent' }] },
    { key: 'company_reg_no', label: 'Company Registration No', icon: 'domain', required: true },
    { key: 'imo_agent_code', label: 'IMO Agent Code', icon: 'qrcode', required: true },
    { key: 'tin_no', label: 'TIN No', icon: 'receipt', required: true },
  ],
  supplier: [
    { key: 'service_category_id', label: 'Service Category', icon: 'cube-outline', required: true },
    { key: 'business_no', label: 'Business Number', icon: 'briefcase-outline', required: true },
    { key: 'duns_no', label: 'DUNS Number', icon: 'domain', required: true },
  ],
  admin: [],
};

export default function RegisterScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');

  const [extraFields, setExtraFields] = useState<Record<string, string>>({});

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [serviceCategories, setServiceCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('service_categories').select('id, name').order('name');
      if (data) setServiceCategories(data);
    })();
  }, []);

  const roleLabel = useMemo(
    () => ROLE_OPTIONS.find((r) => r.value === role)?.label ?? '',
    [role]
  );

  const activeFields = useMemo(() => (role ? ROLE_FIELDS[role] : []), [role]);

  const handleRoleChange = (newRole: UserRole | null) => {
    setRole(newRole);
    setExtraFields({});
  };

  const setExtra = (key: string, value: string) => {
    setExtraFields((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): string | null => {
    if (fullName.trim().length < 2) return 'Please enter your full name.';
    if (username.trim().length < 3) return 'Username must be at least 3 characters.';
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!role) return 'Please select a role.';
    for (const field of activeFields) {
      if (field.required && !(extraFields[field.key] ?? '').trim()) {
        return `${field.label} is required.`;
      }
    }
    return null;
  };

  const onSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);

    const extra: Record<string, string | null> = {};
    for (const field of activeFields) {
      extra[field.key] = (extraFields[field.key] ?? '').trim() || null;
    }

    const { error: signUpError } = await signUp({
      email: email.trim(),
      username: username.trim(),
      password,
      full_name: fullName.trim(),
      role: role!,
      company_name: companyName.trim() || null,
      phone: phone.trim() || null,
      ...extra,
    });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message || 'Unable to create account.');
      return;
    }
    router.replace('/(auth)/pending-verification');
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
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="boat" size={28} color={palette.fogWhite} />
          </View>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>
            Register to coordinate maritime provisioning.
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            mode="outlined"
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            left={<TextInput.Icon icon="account-outline" />}
            style={styles.input}
            disabled={submitting}
          />
          <TextInput
            mode="outlined"
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="username"
            left={<TextInput.Icon icon="account-circle-outline" />}
            style={styles.input}
            disabled={submitting}
          />
          <TextInput
            mode="outlined"
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            left={<TextInput.Icon icon="email-outline" />}
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
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onPress={() => setShowPassword((v) => !v)}
              />
            }
            style={styles.input}
            disabled={submitting}
          />

          <Menu
            visible={roleMenuOpen}
            onDismiss={() => setRoleMenuOpen(false)}
            anchor={
              <TextInput
                mode="outlined"
                label="Role"
                value={roleLabel}
                editable={false}
                pointerEvents="none"
                left={<TextInput.Icon icon="badge-account-outline" />}
                right={
                  <TextInput.Icon
                    icon="menu-down"
                    onPress={() => setRoleMenuOpen(true)}
                  />
                }
                onPressIn={() => setRoleMenuOpen(true)}
                style={styles.input}
                disabled={submitting}
              />
            }
            contentStyle={styles.menuContent}
          >
            {ROLE_OPTIONS.map((opt) => (
              <Menu.Item
                key={opt.value}
                title={opt.label}
                titleStyle={styles.menuItemTitle}
                onPress={() => {
                  handleRoleChange(opt.value);
                  setRoleMenuOpen(false);
                }}
              />
            ))}
          </Menu>

          {/* Role-specific fields */}
          {activeFields.map((field) => {
            if (field.key === 'service_category_id') {
              const selectedCat = serviceCategories.find((c) => c.id === extraFields['service_category_id']);
              return (
                <Menu
                  key={field.key}
                  visible={categoryMenuOpen}
                  onDismiss={() => setCategoryMenuOpen(false)}
                  anchor={
                    <TextInput
                      mode="outlined"
                      label={field.label}
                      value={selectedCat?.name ?? ''}
                      editable={false}
                      pointerEvents="none"
                      left={<TextInput.Icon icon="cube-outline" />}
                      right={
                        <TextInput.Icon
                          icon="menu-down"
                          onPress={() => setCategoryMenuOpen(true)}
                        />
                      }
                      onPressIn={() => setCategoryMenuOpen(true)}
                      style={styles.input}
                      disabled={submitting}
                    />
                  }
                  contentStyle={styles.menuContent}
                >
                  {serviceCategories.map((cat) => (
                    <Menu.Item
                      key={cat.id}
                      title={cat.name}
                      titleStyle={styles.menuItemTitle}
                      onPress={() => {
                        setExtra('service_category_id', cat.id);
                        setCategoryMenuOpen(false);
                      }}
                    />
                  ))}
                </Menu>
              );
            }
            if (field.type === 'select' && field.options) {
              const selectedOpt = field.options.find((o) => o.value === extraFields[field.key]);
              return (
                <Menu
                  key={field.key}
                  visible={activeMenuId === field.key}
                  onDismiss={() => setActiveMenuId(null)}
                  anchor={
                    <TextInput
                      mode="outlined"
                      label={field.label}
                      value={selectedOpt?.label ?? ''}
                      editable={false}
                      pointerEvents="none"
                      left={<TextInput.Icon icon={field.icon as any} />}
                      right={
                        <TextInput.Icon
                          icon="menu-down"
                          onPress={() => setActiveMenuId(field.key)}
                        />
                      }
                      onPressIn={() => setActiveMenuId(field.key)}
                      style={styles.input}
                      disabled={submitting}
                    />
                  }
                  contentStyle={styles.menuContent}
                >
                  {field.options.map((opt) => (
                    <Menu.Item
                      key={opt.value}
                      title={opt.label}
                      titleStyle={styles.menuItemTitle}
                      onPress={() => {
                        setExtra(field.key, opt.value);
                        setActiveMenuId(null);
                      }}
                    />
                  ))}
                </Menu>
              );
            }
            return (
              <TextInput
                key={field.key}
                mode="outlined"
                label={field.label}
                value={extraFields[field.key] ?? ''}
                onChangeText={(v) => setExtra(field.key, v)}
                left={<TextInput.Icon icon={field.icon as keyof typeof Ionicons.glyphMap} />}
                style={styles.input}
                disabled={submitting}
              />
            );
          })}

          <TextInput
            mode="outlined"
            label="Company name (optional)"
            value={companyName}
            onChangeText={setCompanyName}
            left={<TextInput.Icon icon="office-building-outline" />}
            style={styles.input}
            disabled={submitting}
          />
          <TextInput
            mode="outlined"
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            left={<TextInput.Icon icon="phone-outline" />}
            style={styles.input}
            disabled={submitting}
          />

          <Button
            mode="contained"
            onPress={onSubmit}
            disabled={submitting}
            style={styles.submit}
            contentStyle={styles.submitContent}
          >
            {submitting ? (
              <ActivityIndicator size={18} color={palette.fogWhite} />
            ) : (
              'Create account'
            )}
          </Button>

          <View style={styles.loginRow}>
            <Text style={styles.muted}>Already have an account? </Text>
            <Link href="/(auth)/login">
              <Text style={styles.linkText}>Sign in</Text>
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
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: palette.oceanMid,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.steelBlue,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: palette.fogWhite,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: palette.hullGray,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  form: { gap: spacing.md },
  input: { backgroundColor: palette.oceanMid },
  menuContent: { backgroundColor: palette.oceanMid },
  menuItemTitle: { color: palette.fogWhite, fontFamily: fonts.body },
  submit: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
  },
  submitContent: { height: 48 },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  muted: { fontFamily: fonts.body, color: palette.hullGray },
  linkText: { fontFamily: fonts.bodySemiBold, color: palette.steelBlue },
  snackbar: { backgroundColor: palette.oceanMid },
});
