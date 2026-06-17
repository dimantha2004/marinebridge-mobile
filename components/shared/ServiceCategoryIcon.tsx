import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { serviceIconFor } from '@/constants/serviceCategories';
import { palette } from '@/constants/theme';

export type ServiceCategoryIconProps = {
  name: string;
  size?: number;
  color?: string;
};

export default function ServiceCategoryIcon({
  name,
  size = 24,
  color = palette.fogWhite,
}: ServiceCategoryIconProps) {
  const iconName = serviceIconFor(name) as keyof typeof Ionicons.glyphMap;
  return <Ionicons name={iconName} size={size} color={color} />;
}
