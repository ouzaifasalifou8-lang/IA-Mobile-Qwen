import React from 'react';
import {View, FlatList} from 'react-native';
import {Text, IconButton} from 'react-native-paper';
import {observer} from 'mobx-react';

import {Sheet} from '../Sheet';
import {useTheme} from '../../hooks';
import {ragStore} from '../../store';
import {createStyles} from './styles';

interface RagDocumentsSheetProps {
  isVisible: boolean;
  onDismiss: () => void;
}

export const RagDocumentsSheet: React.FC<RagDocumentsSheetProps> = observer(
  ({isVisible, onDismiss}) => {
    const theme = useTheme();
    const styles = createStyles(theme);

    const handleDelete = (id: string) => {
      ragStore.removeDocument(id);
    };

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onDismiss}
        title="Mes documents (RAG)"
        snapPoints={['60%']}>
        <Sheet.ScrollView contentContainerStyle={styles.container}>
          {ragStore.documents.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucun document importe pour le moment.
            </Text>
          ) : (
            <FlatList
              data={ragStore.documents}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({item}) => (
                <View style={styles.documentRow}>
                  <Text style={styles.documentName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <IconButton
                    icon="delete"
                    size={20}
                    onPress={() => handleDelete(item.id)}
                    accessibilityLabel={'Supprimer ' + item.name}
                  />
                </View>
              )}
            />
          )}
        </Sheet.ScrollView>
      </Sheet>
    );
  },
);
