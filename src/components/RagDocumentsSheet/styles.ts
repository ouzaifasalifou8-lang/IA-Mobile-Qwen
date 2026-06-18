import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      padding: 16,
      paddingBottom: 32,
    },
    emptyText: {
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: 24,
    },
    documentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.surfaceContainerLow,
    },
    documentName: {
      flex: 1,
      color: theme.colors.onSurface,
      marginRight: 8,
    },
  });
};
