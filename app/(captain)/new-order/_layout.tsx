import React from 'react';
import { Stack } from 'expo-router';
import { palette } from '@/constants/theme';

export default function NewOrderLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.navyDeep },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="add-services" />
      <Stack.Screen name="cart" />
    </Stack>
  );
}
