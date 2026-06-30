import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { palette, fonts } from '@/constants/theme';

export default function AdminLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.steelBlue,
        tabBarInactiveTintColor: palette.hullGray,
        tabBarStyle: {
          backgroundColor: palette.navyDeep,
          borderTopColor: palette.oceanMid,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="users"
        options={{
          title: 'Users',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="monitoring"
        options={{
          title: 'Live',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="supplier-mapping"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="ports"
        options={{
          title: 'Ports',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="boat-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
