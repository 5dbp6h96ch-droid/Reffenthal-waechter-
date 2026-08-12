const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'app', 'index.tsx');
const source = fs.readFileSync(file, 'utf8');
const importAnchor = "import { GaugeAlertRow } from '@/components/GaugeAlertRow';";
const forecastImport = "import RheinGaugeForecast from '@/components/RheinGaugeForecast';";
const startMarker = '            {/* 1. Vorhersage */}';
const endMarker = '            <View style={menuDivider} />\n\n            {/* 2. WSV';

if (source.includes(forecastImport)) {
  process.exit(0);
}

if (!source.includes(importAnchor)) {
  throw new Error('Forecast patch: import anchor not found');
}

const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  throw new Error('Forecast patch: forecast UI markers not found');
}

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

const importPos = source.indexOf(importAnchor) + importAnchor.length;
const patched =
  source.slice(0, importPos) + '\n' + forecastImport +
  source.slice(importPos, start) + replacement + source.slice(end);

fs.writeFileSync(file, patched, 'utf8');
console.log('TEST forecast UI patched for build');
