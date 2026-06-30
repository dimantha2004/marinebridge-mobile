import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, IconButton, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import type { CartItem } from '@/stores/cartStore';
import { serviceIconFor } from '@/constants/serviceCategories';
import { palette, spacing, radius, fonts } from '@/constants/theme';

export type ServiceCartItemProps = {
  item: CartItem;
  onEdit?: (item: CartItem) => void;
  onRemove?: (item: CartItem) => void;
};

export default function ServiceCartItem({ item, onEdit, onRemove }: ServiceCartItemProps) {
  const icon = (item.iconName || serviceIconFor(item.serviceName)) as keyof typeof Ionicons.glyphMap;

  return (
    <Card style={styles.card} mode="contained">
      <Card.Content style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={22} color={palette.steelBlue} />
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {item.serviceName}
          </Text>
          {item.fileName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Ionicons name="document-attach" size={14} color={palette.engineGreen} />
              <Text style={{ fontFamily: fonts.body, color: palette.engineGreen, fontSize: 13 }} numberOfLines={1}>
                {item.fileName}
              </Text>
            </View>
          ) : (
            <Text style={styles.meta}>No file attached</Text>
          )}
          {item.specifications ? (
            <Text style={styles.specs} numberOfLines={1}>
              {item.specifications}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          <View style={styles.actions}>
            <IconButton
              icon={() => <Ionicons name="create-outline" size={18} color={palette.steelBlue} />}
              size={18}
              onPress={() => onEdit?.(item)}
              accessibilityLabel="Edit item"
            />
            <IconButton
              icon={() => <Ionicons name="trash-outline" size={18} color={palette.alertRed} />}
              size={18}
              onPress={() => onRemove?.(item)}
              accessibilityLabel="Remove item"
            />
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.oceanMid, borderRadius: radius.md, marginBottom: spacing.sm },
  content: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.navyDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.bodySemiBold, color: palette.fogWhite, fontSize: 15 },
  meta: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 13, marginTop: 2 },
  specs: { fontFamily: fonts.body, color: palette.hullGray, fontSize: 12, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  total: { fontFamily: fonts.mono, color: palette.fogWhite, fontSize: 15 },
  actions: { flexDirection: 'row', marginTop: spacing.xs },
});
