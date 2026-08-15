/**
 * GifLightbox.tsx – Native Variante der GIF-Lightbox (iOS/Android-App).
 *
 * Auf nativen Plattformen wird ein einfaches Modal mit dem GIF und einem
 * Schließen-Button angezeigt. Pinch-Zoom ist bewusst nur in der Web-Variante
 * umgesetzt (GifLightbox.web.tsx) – Auftrag betrifft die Web-/PWA-Ansicht.
 */

import React from 'react';
import { Modal, View, Image, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  uri: string;
  onClose: () => void;
}

export default function GifLightbox({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: Math.max(insets.top, 10),
        paddingBottom: Math.max(insets.bottom, 10),
        paddingLeft: Math.max(insets.left, 8),
        paddingRight: Math.max(insets.right, 8),
      }}>
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '75%', borderRadius: 8 }}
          resizeMode="contain"
        />
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{
            position: 'absolute',
            top: Math.max(insets.top, 10) + 6,
            right: Math.max(insets.right, 10) + 6,
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: 'rgba(255,255,255,0.22)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 20, color: '#FFFFFF', lineHeight: 22 }}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
