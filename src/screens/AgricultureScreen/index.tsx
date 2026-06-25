import React, {useState} from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react';
import {useTheme} from '../../hooks';
import {translationService} from '../../services/translationService';

// Prompts agricoles en Haoussa et Français
const CATEGORIES = [
  {
    id: 'cultures',
    label: '🌱 Cultures',
    labelHa: '🌱 Shuke-shuke',
    prompts: [
      {
        fr: 'Quelles cultures sont adaptées à la région de Tahoua en saison sèche ?',
        ha: 'Wane irin shuke-shuke ya dace da yankin Tahoua a lokacin rani ?',
      },
      {
        fr: 'Comment cultiver les oignons au Niger ? Quels sont les meilleurs mois ?',
        ha: 'Yaya ake shuka albasa a Nijar ? Wanne wata ya fi kyau ?',
      },
      {
        fr: 'Comment améliorer le rendement du mil et du sorgho ?',
        ha: 'Yaya ake inganta amfanin gero da dawa ?',
      },
      {
        fr: 'Quels légumes peut-on cultiver pendant la saison des pluies à Tahoua ?',
        ha: 'Wane irin kayan marmari ake iya shuka a lokacin damina a Tahoua ?',
      },
      {
        fr: 'Comment cultiver les tomates en petite irrigation ?',
        ha: 'Yaya ake shuka tumatir da ban ruwa kaɗan ?',
      },
    ],
  },
  {
    id: 'eau',
    label: '💧 Irrigation',
    labelHa: '💧 Ban ruwa',
    prompts: [
      {
        fr: 'Quelles sont les meilleures techniques d\'irrigation pour economiser l\'eau à Tahoua ?',
        ha: 'Wane irin hanyoyin ban ruwa ne mafi kyau don adana ruwa a Tahoua ?',
      },
      {
        fr: 'Comment construire un système de goutte-à-goutte simple et pas cher ?',
        ha: 'Yaya ake gina tsarin ban ruwa drip mai arha ?',
      },
      {
        fr: 'Quelle est la quantité d\'eau necessaire pour les oignons par semaine ?',
        ha: 'Nawa ruwa albasa ke bukata a mako guda ?',
      },
    ],
  },
  {
    id: 'sols',
    label: '🌍 Sols & Engrais',
    labelHa: '🌍 Ƙasa & Takin zamani',
    prompts: [
      {
        fr: 'Comment améliorer la fertilité des sols sableux au Sahel ?',
        ha: 'Yaya ake inganta ƙasa mai yashi a yankin Sahel ?',
      },
      {
        fr: 'Quels engrais naturels peut-on utiliser au Niger ? Comment les préparer ?',
        ha: 'Wane irin takin zamani na halitta ake amfani da su a Nijar ? Yaya ake shirya su ?',
      },
      {
        fr: 'Comment faire du compost avec les déchets agricoles ?',
        ha: 'Yaya ake yin takin kore da ragowar gona ?',
      },
    ],
  },
  {
    id: 'maladies',
    label: '🦟 Maladies & Ravageurs',
    labelHa: '🦟 Cututtuka & Ƙwari',
    prompts: [
      {
        fr: 'Comment traiter les maladies des oignons au Niger naturellement ?',
        ha: 'Yaya ake magance cututtukan albasa a Nijar ta hanyar halitta ?',
      },
      {
        fr: 'Quels sont les insectes nuisibles au mil et comment les combattre ?',
        ha: 'Wane irin ƙwari suna lalata gero kuma yaya ake yakar su ?',
      },
      {
        fr: 'Comment protéger les cultures contre la sécheresse ?',
        ha: 'Yaya ake kare shuke-shuke daga fari ?',
      },
    ],
  },
  {
    id: 'marche',
    label: '💰 Marché & Vente',
    labelHa: '💰 Kasuwa & Sayarwa',
    prompts: [
      {
        fr: 'Comment bien vendre les oignons au marché de Tahoua ?',
        ha: 'Yaya ake sayar da albasa yadda ya kamata a kasuwar Tahoua ?',
      },
      {
        fr: 'Comment conserver les oignons longtemps après la récolte ?',
        ha: 'Yaya ake adana albasa tsawon lokaci bayan girbi ?',
      },
      {
        fr: 'Quelles cultures sont les plus rentables à Tahoua en ce moment ?',
        ha: 'Wane irin shuke-shuke ne mafi riba a Tahoua yanzu ?',
      },
    ],
  },
  {
    id: 'elevage',
    label: '🐄 Élevage',
    labelHa: '🐄 Kiwo',
    prompts: [
      {
        fr: 'Comment soigner les maladies courantes des chèvres au Niger ?',
        ha: 'Yaya ake magance cututtukan awaki a Nijar ?',
      },
      {
        fr: 'Quelle alimentation pour les chèvres pendant la saison sèche ?',
        ha: 'Wane irin abinci ake ba awaki a lokacin rani ?',
      },
      {
        fr: 'Comment améliorer la production de lait des chèvres ?',
        ha: 'Yaya ake inganta nono na awaki ?',
      },
    ],
  },
];

interface AgricultureScreenProps {
  onSendMessage?: (text: string) => void;
  navigation?: any;
}

export const AgricultureScreen: React.FC<AgricultureScreenProps> = observer(({navigation}) => {
  const theme = useTheme();
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].id);
  const [useHausa, setUseHausa] = useState(true);

  const currentCategory = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0];

  const handlePromptPress = (prompt: {fr: string; ha: string}) => {
    const text = useHausa ? prompt.ha : prompt.fr;
    Alert.alert(
      useHausa ? 'Aika zuwa AI ?' : 'Envoyer à l\'AI ?',
      text,
      [
        {text: useHausa ? 'A\'a' : 'Annuler', style: 'cancel'},
        {
          text: useHausa ? 'Eh, aika' : 'Envoyer',
          onPress: () => {
            // Naviguer vers le chat avec ce message
            if (navigation) {
              navigation.navigate('ChatStack', {
                screen: 'Chat',
                params: {pendingMessage: text},
              });
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      {/* Header */}
      <View style={[styles.header, {backgroundColor: theme.colors.primary}]}>
        <Text style={[styles.headerTitle, {color: theme.colors.onPrimary}]}>
          🌾 {useHausa ? 'Noma & Kiwo' : 'Agriculture & Élevage'}
        </Text>
        <TouchableOpacity
          onPress={() => setUseHausa(!useHausa)}
          style={[styles.langBtn, {backgroundColor: theme.colors.primaryContainer}]}>
          <Text style={{color: theme.colors.onPrimaryContainer, fontSize: 12, fontWeight: 'bold'}}>
            {useHausa ? 'FR' : 'HA'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Catégories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setSelectedCategory(cat.id)}
            style={[
              styles.catBtn,
              {
                backgroundColor: selectedCategory === cat.id
                  ? theme.colors.primary
                  : theme.colors.surfaceVariant,
              },
            ]}>
            <Text style={{
              color: selectedCategory === cat.id
                ? theme.colors.onPrimary
                : theme.colors.onSurfaceVariant,
              fontSize: 12,
              fontWeight: 'bold',
            }}>
              {useHausa ? cat.labelHa : cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Prompts */}
      <ScrollView style={styles.promptsContainer}>
        <Text style={[styles.sectionTitle, {color: theme.colors.onSurfaceVariant}]}>
          {useHausa ? 'Zaɓi tambaya:' : 'Choisir une question:'}
        </Text>
        {currentCategory.prompts.map((prompt, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => handlePromptPress(prompt)}
            style={[styles.promptCard, {backgroundColor: theme.colors.surfaceVariant}]}>
            <Text style={[styles.promptText, {color: theme.colors.onSurface}]}>
              {useHausa ? prompt.ha : prompt.fr}
            </Text>
            <Text style={[styles.promptArrow, {color: theme.colors.primary}]}>→</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 20,
  },
  headerTitle: {fontSize: 18, fontWeight: 'bold'},
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  catScroll: {
    maxHeight: 60,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  catBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    height: 36,
    justifyContent: 'center',
  },
  promptsContainer: {flex: 1, padding: 12},
  sectionTitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  promptCard: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  promptText: {flex: 1, fontSize: 14, lineHeight: 20},
  promptArrow: {fontSize: 18, marginLeft: 8},
});
