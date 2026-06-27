import React, {useState, useEffect} from 'react';
import {View, TouchableOpacity, StyleSheet} from 'react-native';
import {Text} from 'react-native-paper';
import {useTheme} from '../../hooks';

interface WeatherData {
  temp: string;
  condition: string;
  humidity: string;
  wind: string;
  city: string;
}

export const WeatherWidget: React.FC<{city?: string}> = ({city = 'Tahoua'}) => {
  const theme = useTheme();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchWeather = async () => {
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(
        `https://wttr.in/${encodeURIComponent(city)}?format=j1`,

      );
      if (!resp.ok) throw new Error('Erreur météo');
      const data = await resp.json();
      const current = data.current_condition?.[0];
      if (current) {
        setWeather({
          temp: current.temp_C + '°C',
          condition: current.weatherDesc?.[0]?.value || '',
          humidity: current.humidity + '%',
          wind: current.windspeedKmph + ' km/h',
          city,
        });
        setLastUpdate(new Date());
      }
    } catch {
      // Silencieux si pas de connexion
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather();
    // Rafraîchir toutes les heures
    const interval = setInterval(fetchWeather, 3600000);
    return () => clearInterval(interval);
  }, [city]);

  if (!weather && !loading) return null;

  const getWeatherEmoji = (condition: string) => {
    const c = condition.toLowerCase();
    if (c.includes('sunny') || c.includes('clear')) return '☀️';
    if (c.includes('cloud')) return '⛅';
    if (c.includes('rain')) return '🌧️';
    if (c.includes('storm') || c.includes('thunder')) return '⛈️';
    if (c.includes('sand') || c.includes('dust')) return '🌫️';
    if (c.includes('haze') || c.includes('fog')) return '🌫️';
    return '🌤️';
  };

  return (
    <TouchableOpacity
      onPress={fetchWeather}
      style={[styles.container, {backgroundColor: theme.colors.surfaceVariant}]}>
      {loading && !weather ? (
        <Text style={{color: theme.colors.onSurfaceVariant, fontSize: 12}}>
          Chargement météo...
        </Text>
      ) : weather ? (
        <View style={styles.row}>
          <Text style={styles.emoji}>
            {getWeatherEmoji(weather.condition)}
          </Text>
          <View>
            <Text style={[styles.temp, {color: theme.colors.onSurface}]}>
              {weather.temp} · {weather.city}
            </Text>
            <Text style={[styles.detail, {color: theme.colors.onSurfaceVariant}]}>
              💧{weather.humidity} 💨{weather.wind}
            </Text>
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
    borderRadius: 8,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  emoji: {fontSize: 24},
  temp: {fontSize: 14, fontWeight: 'bold'},
  detail: {fontSize: 11},
});
