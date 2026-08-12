import React from 'react';
import { Platform, View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import OriginalHomeScreen from '@/components/OriginalHomeScreen';
import { useAuth } from '@/hooks/useAuth';

function clickExistingBottomTab(label: string) {
  if (typeof document === 'undefined') return;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div,span,p'))
    .filter((el) => el.textContent?.trim() === label)
    .filter((el) => el.getBoundingClientRect().bottom > window.innerHeight - 160);
  candidates.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
  candidates[0]?.click();
}

function LoggedInBottomNavOverlay() {
  const { user } = useAuth();

  if (Platform.OS !== 'web' || !user) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'fixed' as any,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw' as any,
        height: 92,
        zIndex: 99999,
        elevation: 99999,
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#D7E7F4',
          paddingTop: 6,
          paddingBottom: 6,
          width: '100%' as any,
        }}
      >
        <TouchableOpacity
          onPress={() => clickExistingBottomTab('Konto')}
          style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          <Feather name="user" size={28} color="#8E8E93" />
          <Text style={{ fontSize: 13, color: '#8E8E93' }}>Konto</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => clickExistingBottomTab('Preferences')}
          style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          <Feather name="sliders" size={28} color="#8E8E93" />
          <Text style={{ fontSize: 13, color: '#8E8E93' }}>Preferences</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => clickExistingBottomTab('Help')}
          style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          <Feather name="help-circle" size={28} color="#8E8E93" />
          <Text style={{ fontSize: 13, color: '#8E8E93' }}>Help</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <OriginalHomeScreen />
      <LoggedInBottomNavOverlay />
    </View>
  );
}
