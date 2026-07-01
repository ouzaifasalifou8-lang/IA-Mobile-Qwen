import React, {useContext, useEffect, useState} from 'react';
import {TouchableOpacity, View, Alert, SectionList} from 'react-native';
import {observer} from 'mobx-react';
import {Divider, Drawer, Text} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {DrawerContentComponentProps} from '@react-navigation/drawer';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {chatSessionStore, SessionMetaData} from '../../store';
import {Menu, RenameModal, Checkbox} from '..';
import {
  BenchmarkIcon,
  ChatIcon,
  EditIcon,
  ModelIcon,
  PalIcon,
  SettingsIcon,
  ShareIcon,
  TrashIcon,
  AppInfoIcon,
} from '../../assets/icons';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {ROUTES} from '../../utils/navigationConstants';
import {exportChatSession} from '../../utils/exportUtils';
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

// Check if app is in debug mode
const isDebugMode = __DEV__;

// Session item props interface
interface SessionItemProps {
  session: SessionMetaData;
  isActive: boolean;
  onPress: (sessionId: string) => void;
  onLongPress: (sessionId: string, event: any) => void;
  menuVisible: string | null;
  menuPosition: {x: number; y: number};
  onMenuDismiss: () => void;
  onPressRename: (session: SessionMetaData) => void;
  onPressDelete: (sessionId: string) => void;
  onPressExport: (sessionId: string) => void;
  onPressSelect: (sessionId: string) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelection: (sessionId: string) => void;
  theme: any;
  styles: any;
  l10n: any;
}

// Memoized session item component
const SessionItem = React.memo<SessionItemProps>(
  ({
    session,
    isActive,
    onPress,
    onLongPress,
    menuVisible,
    menuPosition,
    onMenuDismiss,
    onPressRename,
    onPressDelete,
    onPressExport,
    onPressSelect,
    isSelectionMode,
    isSelected,
    onToggleSelection,
    theme,
    styles,
    l10n,
  }) => {
    const handlePress = () => {
      if (isSelectionMode) {
        onToggleSelection(session.id);
      } else {
        onPress(session.id);
      }
    };

    const handleLongPress = (event: any) => {
      if (!isSelectionMode) {
        onLongPress(session.id, event);
      }
    };

    return (
      <View style={styles.sessionItemContainer}>
        {isSelectionMode && (
          <View style={styles.sessionCheckbox}>
            <Checkbox
              checked={isSelected}
              onPress={() => onToggleSelection(session.id)}
              testID={`checkbox-${session.id}`}
            />
          </View>
        )}
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={handleLongPress}
          style={styles.sessionTouchable}>
          <Drawer.Item
            active={isActive}
            label={session.title}
            style={styles.sessionDrawerItem}
          />
        </TouchableOpacity>

        {!isSelectionMode && (
          <Menu
            visible={menuVisible === session.id}
            onDismiss={onMenuDismiss}
            anchor={menuPosition}
            style={styles.menu}
            contentStyle={{}}
            anchorPosition="bottom">
            <Menu.Item
              onPress={() => {
                onPressRename(session);
                onMenuDismiss();
              }}
              label={l10n.common.rename}
              leadingIcon={() => <EditIcon stroke={theme.colors.primary} />}
            />
            <Menu.Item
              onPress={() => {
                onPressExport(session.id);
                onMenuDismiss();
              }}
              label={l10n.common.export}
              leadingIcon={() => <ShareIcon stroke={theme.colors.primary} />}
            />
            <Menu.Item
              onPress={() => {
                onPressDelete(session.id);
                onMenuDismiss();
              }}
              label={l10n.common.delete}
              labelStyle={{color: theme.colors.error}}
              leadingIcon={() => <TrashIcon stroke={theme.colors.error} />}
            />
            <Divider style={styles.menuDivider} />
            <Menu.Item
              onPress={() => {
                onPressSelect(session.id);
                onMenuDismiss();
              }}
              label={`${l10n.components.sidebarContent.select}...`}
            />
          </Menu>
        )}
      </View>
    );
  },
);

SessionItem.displayName = 'SessionItem';

// Selection mode header component
interface SelectionModeHeaderProps {
  selectedCount: number;
  onCancel: () => void;
  onExport: () => void;
  onDelete: () => void;
  l10n: any;
  theme: any;
  styles: any;
}
const SelectionModeHeader: React.FC<SelectionModeHeaderProps> = ({
  selectedCount,
  onCancel,
  onExport,
  onDelete,
  l10n,
  theme,
  styles,
}) => {
  return (
    <View style={styles.selectionModeHeader}>
      <TouchableOpacity onPress={onCancel} testID="cancel-selection-button">
        <Text style={{color: theme.colors.primary}}>{l10n.common.cancel}</Text>
      </TouchableOpacity>
      <Text style={styles.selectionCount}>
        {selectedCount} {l10n.components.sidebarContent.selected}
      </Text>
      <View style={styles.selectionActions}>
        <TouchableOpacity onPress={onExport} testID="export-selected-button">
          <ShareIcon width={24} height={24} stroke={theme.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} testID="delete-selected-button">
          <TrashIcon width={24} height={24} stroke={theme.colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
};
SelectionModeHeader.displayName = 'SelectionModeHeader';

// Select all row component
interface SelectAllRowProps {
  allSelected: boolean;
  onToggle: () => void;
  l10n: any;
  styles: any;
}

const SelectAllRow: React.FC<SelectAllRowProps> = ({
  allSelected,
  onToggle,
  l10n,
  styles,
}) => {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={styles.selectAllRow}
      testID="select-all-row">
      <View style={styles.selectAllCheckbox}>
        <Checkbox checked={allSelected} onPress={onToggle} />
      </View>
      <Text style={styles.selectAllText}>
        {l10n.components.sidebarContent.selectAll}
      </Text>
    </TouchableOpacity>
  );
};

SelectAllRow.displayName = 'SelectAllRow';

export const SidebarContent: React.FC<DrawerContentComponentProps> = observer(
  props => {
    const [menuVisible, setMenuVisible] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState({x: 0, y: 0});
    const [sessionToRename, setSessionToRename] =
      useState<SessionMetaData | null>(null);
    const [renameModalVisible, setRenameModalVisible] = useState(false);

    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const insets = useSafeAreaInsets();

    // Convert groupedSessions to SectionList format
    // observer() HOC handles MobX reactivity, transformation is cheap
    const sections = Object.entries(chatSessionStore.groupedSessions).map(
      ([dateLabel, sessions]) => ({
        title: dateLabel,
        data: sessions,
      }),
    );

    useEffect(() => {
      chatSessionStore.loadSessionList();

      // Set localized date group names whenever the component mounts
      chatSessionStore.setDateGroupNames(
        l10n.components.sidebarContent.dateGroups,
      );
    }, [l10n.components.sidebarContent.dateGroups]);

    const openMenu = React.useCallback((sessionId: string, event: any) => {
      const {nativeEvent} = event;
      setMenuPosition({x: nativeEvent.pageX, y: nativeEvent.pageY});
      setMenuVisible(sessionId);
    }, []);

    const closeMenu = React.useCallback(() => {
      setMenuVisible(null);
    }, []);

    const handleSessionPress = React.useCallback(
      async (sessionId: string) => {
        await chatSessionStore.setActiveSession(sessionId);
        props.navigation.navigate(ROUTES.CHAT);
      },
      [props.navigation],
    );

    const handleSessionLongPress = React.useCallback(
      (sessionId: string, event: any) => {
        openMenu(sessionId, event);
      },
      [openMenu],
    );

    const handlePressRename = React.useCallback((session: SessionMetaData) => {
      setSessionToRename(session);
      setRenameModalVisible(true);
    }, []);

    const handleRenameConfirm = React.useCallback(
      async (newTitle: string) => {
        if (sessionToRename && newTitle.trim()) {
          await chatSessionStore.renameSession(sessionToRename.id, newTitle.trim());
        }
        setRenameModalVisible(false);
        setSessionToRename(null);
      },
      [sessionToRename],
    );

    const handleRenameCancel = React.useCallback(() => {
      setRenameModalVisible(false);
      setSessionToRename(null);
    }, []);

    const handlePressDelete = React.useCallback(
      async (sessionId: string) => {
        Alert.alert(
          l10n.components.sidebarContent.deleteConfirmationTitle || 'Confirm Delete',
          l10n.components.sidebarContent.deleteConfirmationMessage || 'Are you sure you want to delete this session?',
          [
            {
              text: l10n.common.cancel,
              style: 'cancel',
            },
            {
              text: l10n.common.delete,
              style: 'destructive',
              onPress: async () => {
                await chatSessionStore.deleteSession(sessionId);
              },
            },
          ],
        );
      },
      [l10n],
    );

    const handlePressExport = React.useCallback(
      async (sessionId: string) => {
        const session = Array.from(chatSessionStore.sessions).find(s => s.id === sessionId);
        if (!session) return;
        
        const success = await exportChatSession(session);
        if (success) {
          Alert.alert(
            l10n.common.success || 'Success',
            l10n.components.sidebarContent.exportSuccess || 'Session exported successfully',
          );
        } else {
          Alert.alert(
            l10n.common.error || 'Error',
            l10n.components.sidebarContent.exportError || 'Failed to export session',
          );
        }
      },
      [l10n],
    );

    const handlePressSelect = React.useCallback(
      (sessionId: string) => {
        chatSessionStore.toggleSessionSelection(sessionId);
        setMenuVisible(null);
      },
      [],
    );

    const handleToggleSelection = React.useCallback(
      (sessionId: string) => {
        chatSessionStore.toggleSessionSelection(sessionId);
      },
      [],
    );

    const handleSelectAll = React.useCallback(() => {
      chatSessionStore.toggleAllSessionsSelection();
    }, []);

    const handleCancelSelection = React.useCallback(() => {
      chatSessionStore.clearSelection();
    }, []);

    const handleExportSelected = React.useCallback(async () => {
      const selectedIds = Array.from(chatSessionStore.selectedSessionIds);
      if (selectedIds.length === 0) return;
      
      // Exporter les sessions sélectionnées
      let success = true;
      for (const id of selectedIds) {
        const session = Array.from(chatSessionStore.sessions).find(s => s.id === id);
        if (session) {
          const result = await exportChatSession(session);
          if (!result) success = false;
        }
      }
      
      if (success) {
        Alert.alert(
          l10n.common.success || 'Success',
          l10n.components.sidebarContent.exportSuccess || 'Sessions exported successfully',
        );
      } else {
        Alert.alert(
          l10n.common.error || 'Error',
          l10n.components.sidebarContent.exportError || 'Failed to export some sessions',
        );
      }
      chatSessionStore.clearSelection();
    }, [l10n]);

    const handleDeleteSelected = React.useCallback(() => {
      const selectedIds = Array.from(chatSessionStore.selectedSessionIds);
      if (selectedIds.length === 0) return;
      
      Alert.alert(
        l10n.components.sidebarContent.deleteConfirmationTitle || 'Confirm Delete',
        `${l10n.components.sidebarContent.deleteSelectedConfirmation || 'Delete'} ${selectedIds.length} ${l10n.components.sidebarContent.sessions || 'sessions'}?`,
        [
          {
            text: l10n.common.cancel,
            style: 'cancel',
          },
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: async () => {
              await chatSessionStore.deleteSelectedSessions();
            },
          },
        ],
      );
    }, [l10n]);

    const handleBulkExport = React.useCallback(async () => {
      try {
        await chatSessionStore.bulkExportSessions();
        Alert.alert(
          l10n.common.success || 'Success',
          l10n.components.sidebarContent.bulkExportSuccess || 'Sessions exported successfully',
        );
      } catch {
        Alert.alert(
          l10n.common.error || 'Error',
          l10n.components.sidebarContent.bulkExportError || 'Failed to export sessions',
        );
      }
    }, [l10n]);

    const isSelectionMode = chatSessionStore.isSelectionMode;

    // Rendu principal
    return (
      <GestureHandlerRootView style={styles.sidebarContainer}>
        <View
          style={[
            styles.contentWrapper,
            {paddingTop: insets.top, paddingBottom: insets.bottom},
          ]}>
          {isSelectionMode ? (
            <>
              <SelectionModeHeader
                selectedCount={chatSessionStore.selectedCount}
                onCancel={handleCancelSelection}
                onExport={handleExportSelected}
                onDelete={handleDeleteSelected}
                l10n={l10n}
                theme={theme}
                styles={styles}
              />
              {chatSessionStore.selectedCount > 0 && (
                <SelectAllRow
                  allSelected={chatSessionStore.allSelected}
                  onToggle={handleSelectAll}
                  l10n={l10n}
                  styles={styles}
                />
              )}
            </>
          ) : (
            <>
              {/* MENU PRINCIPAL */}
              <View style={styles.menuSection}>
                <Drawer.Item
                  label={l10n.components.sidebarContent.menuItems.chat}
                  icon={() => <ChatIcon stroke={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate(ROUTES.CHAT)}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-chat"
                />

                <Drawer.Item
                  label="Chat API"
                  icon={() => <Icon name="api" size={24} color={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate("ApiChat")}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-apichat"
                />

                <Drawer.Item
                  label="Agriculture"
                  icon={() => <Icon name="sprout" size={24} color={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate(ROUTES.AGRICULTURE)}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-agriculture"
                />

                <Drawer.Item
                  label="Connection"
                  icon={() => <Icon name="bluetooth" size={24} color={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate(ROUTES.CONNECTION)}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-connection"
                />

                <Drawer.Item
                  label={l10n.components.sidebarContent.menuItems.pals}
                  icon={() => <PalIcon stroke={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate(ROUTES.PALS)}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-pals"
                />

                <Drawer.Item
                  label={l10n.components.sidebarContent.menuItems.models}
                  icon={() => <ModelIcon stroke={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate(ROUTES.MODELS)}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-models"
                />

                <Drawer.Item
                  label={l10n.components.sidebarContent.menuItems.benchmark}
                  icon={() => <BenchmarkIcon stroke={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate(ROUTES.BENCHMARK)}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-benchmark"
                />

                <Drawer.Item
                  label={l10n.components.sidebarContent.menuItems.settings}
                  icon={() => <SettingsIcon stroke={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate(ROUTES.SETTINGS)}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-settings"
                />

                <Drawer.Item
                  label={l10n.components.sidebarContent.menuItems.appInfo}
                  icon={() => <AppInfoIcon stroke={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate(ROUTES.APP_INFO)}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-appinfo"
                />

                <Drawer.Item
                  label="API & IA"
                  icon={() => <SettingsIcon stroke={theme.colors.primary} />}
                  onPress={() => props.navigation.navigate(ROUTES.API_SETTINGS)}
                  style={styles.menuDrawerItem}
                  testID="drawer-item-api-settings"
                />

                {isDebugMode && (
                  <Drawer.Item
                    label="Dev Tools"
                    icon={() => <SettingsIcon stroke={theme.colors.primary} />}
                    onPress={() => props.navigation.navigate(ROUTES.DEV_TOOLS)}
                    style={styles.menuDrawerItem}
                    testID="drawer-item-dev-tools"
                  />
                )}
              </View>

              {/* Liste des sessions */}
              <Divider style={styles.divider} />
              <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderItem={({item}) => (
                  <SessionItem
                    session={item}
                    isActive={chatSessionStore.activeSessionId === item.id}
                    onPress={handleSessionPress}
                    onLongPress={handleSessionLongPress}
                    menuVisible={menuVisible}
                    menuPosition={menuPosition}
                    onMenuDismiss={closeMenu}
                    onPressRename={handlePressRename}
                    onPressDelete={handlePressDelete}
                    onPressExport={handlePressExport}
                    onPressSelect={handlePressSelect}
                    isSelectionMode={isSelectionMode}
                    isSelected={Array.from(chatSessionStore.selectedSessionIds).includes(item.id)}
                    onToggleSelection={handleToggleSelection}
                    theme={theme}
                    styles={styles}
                    l10n={l10n}
                  />
                )}
                renderSectionHeader={({section: {title}}) => (
                  <Text style={styles.sectionHeader}>{title}</Text>
                )}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={styles.listContent}
              />
            </>
          )}
        </View>

        {/* Modale de renommage */}
        <RenameModal
          visible={renameModalVisible}
          initialValue={sessionToRename?.title || ''}
          onConfirm={handleRenameConfirm}
          onCancel={handleRenameCancel}
          title={l10n.components.sidebarContent.renameSession}
          placeholder={l10n.components.sidebarContent.enterSessionName}
        />
      </GestureHandlerRootView>
    );
  },
);

SidebarContent.displayName = 'SidebarContent';
