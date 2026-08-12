const upstream = require('@expo/metro-config/babel-transformer');

const FORECAST_IMPORT = "import RheinGaugeForecast from '@/components/RheinGaugeForecast';";

function patchForecastUi(src, filename) {
  if (!filename.endsWith('/app/index.tsx')) return src;
  if (src.includes(FORECAST_IMPORT)) return src;

  const importAnchor = "import { GaugeAlertRow } from '@/components/GaugeAlertRow';";
  if (!src.includes(importAnchor)) return src;

  const startMarker = '            {/* 1. Vorhersage */}';
  const endMarker = '            <View style={menuDivider} />\n\n            {/* 2. WSV';
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start < 0 || end < 0) return src;

  const replacement = `            {/* 1. Vorhersage */}
            <>
              <TouchableOpacity
                onPress={() => setHvzOpen(o => !o)}
                activeOpacity={0.7}
                style={menuRow}
              >
                <MenuRowLeft icon="trending-up" label="Vorhersage" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (selectedGauge?.pegel_uuid) {
                        void Linking.openURL(
                          'https://pegelonline.wsv.de/webservices/rest-api/v2/stations/' + selectedGauge.pegel_uuid + '.json?includeForecastTimeseries=true',
                        );
                      }
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_400Regular', color: colors.mutedForeground }}>
                      PEGELONLINE
                    </Text>
                    <Feather name="external-link" size={11} color={colors.mutedForeground} />
                  </TouchableOpacity>
                  <Feather name={hvzOpen ? 'chevron-up' : 'chevron-right'} size={16} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>

              {hvzOpen && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 }}>
                  <RheinGaugeForecast
                    stationId={selectedGauge?.pegel_uuid ?? null}
                    stationName={selectedGauge?.name ?? null}
                  />
                </View>
              )}
            </>

`;

  return (
    src.slice(0, src.indexOf(importAnchor) + importAnchor.length) +
    '\n' + FORECAST_IMPORT +
    src.slice(src.indexOf(importAnchor) + importAnchor.length, start) +
    replacement +
    src.slice(end)
  );
}

module.exports.transform = function transform(args) {
  const src = patchForecastUi(args.src, args.filename);
  return upstream.transform({ ...args, src });
};
