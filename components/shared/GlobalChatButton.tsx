import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette, spacing } from '@/constants/theme';
import ChatContactsModal from './ChatContactsModal';

export default function GlobalChatButton() {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setVisible(true)}
        style={styles.fab}
        accessibilityLabel="Open chat"
      >
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={palette.fogWhite} />
      </TouchableOpacity>
      <ChatContactsModal visible={visible} onDismiss={() => setVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    top: 50,
    right: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.steelBlue,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 6,
  },
});
