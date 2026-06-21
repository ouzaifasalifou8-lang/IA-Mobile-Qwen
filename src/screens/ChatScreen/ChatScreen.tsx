import { translationService } from "../../services/translationService";
import React, {useRef, ReactNode, useState} from 'react';
import {View, TouchableOpacity, Text, StyleSheet} from 'react-native';

import {observer} from 'mobx-react';
import {runInAction} from 'mobx';

import {
  Bubble,
  ChatView,
  ErrorSnackbar,
  ModelErrorReportSheet,
} from '../../components';
import {PalSheet} from '../../components/PalsSheets';

import {useChatSession} from '../../hooks';
import {usePendingMessage} from '../../hooks/useDeepLinking';
import {Pal} from '../../types/pal';

import {modelStore, chatSessionStore, palStore, uiStore} from '../../store';
import {esp32Manager} from '../../services/esp32';
import {hasVideoCapability} from '../../utils/pal-capabilities';

import {L10nContext} from '../../utils';
import {MessageType} from '../../utils/types';
import {ErrorState} from '../../utils/errors';
import {user, assistant} from '../../utils/chat';

import {VideoPalScreen} from './VideoPalScreen';

const renderBubble = ({
  child,
  message,
  nextMessageInGroup,
  scale,
}: {
  child: ReactNode;
  message: MessageType.Any;
  nextMessageInGroup: boolean;
  scale?: any;
}) => (
  <Bubble
    child={child}
    message={message}
    nextMessageInGroup={nextMessageInGroup}
    scale={scale}
  />
);

export const ChatScreen: React.FC = observer(() => {
  const currentMessageInfo = useRef<{
    createdAt: number;
    id: string;
    sessionId: string;
  } | null>(null);
  const l10n = React.useContext(L10nContext);

  const activePalId = chatSessionStore.activePalId;
  const activePal = activePalId
    ? palStore.pals.find(p => p.id === activePalId)
    : undefined;
  const isVideoPal = activePal && hasVideoCapability(activePal);

  // State for pal sheet
  const [isPalSheetVisible, setIsPalSheetVisible] = useState(false);

  // State for model error report sheet
  const [isErrorReportVisible, setIsErrorReportVisible] = useState(false);
  const [errorToReport, setErrorToReport] = useState<ErrorState | null>(null);

  const {handleSendPress, handleStopPress, isMultimodalEnabled} =
    useChatSession(currentMessageInfo, user, assistant);

  // Handle deep linking for message prefill
  const {pendingMessage, clearPendingMessage} = usePendingMessage();

  // Callback handler for opening pal sheet
  const handleOpenPalSheet = React.useCallback((_pal: Pal) => {
    setIsPalSheetVisible(true);
  }, []);

  const handleClosePalSheet = React.useCallback(() => {
    setIsPalSheetVisible(false);
  }, []);

  // Handlers for model error report
  const handleReportModelError = React.useCallback(() => {
    if (modelStore.modelLoadError) {
      setErrorToReport(modelStore.modelLoadError);
      setIsErrorReportVisible(true);
      modelStore.clearModelLoadError();
    }
  }, []);

  const handleCloseErrorReport = React.useCallback(() => {
    setIsErrorReportVisible(false);
    setErrorToReport(null);
  }, []);

  // Check if multimodal is enabled
  const [multimodalEnabled, setMultimodalEnabled] = React.useState(false);

  // OUZAIF: Mode robot - connexion bidirectionnelle avec l'ESP32
  const [robotMode, setRobotMode] = useState(false);
  const [esp32Connected, setEsp32Connected] = useState(false);

  React.useEffect(() => {
    // Ecouter les changements de connexion ESP32
    const unsubConn = esp32Manager.onConnectionChange(connected => {
      setEsp32Connected(connected);
      if (!connected && robotMode) {
        setRobotMode(false);
        esp32Manager.stopRobotMode();
      }
    });
    return () => {
      unsubConn();
    };
  }, [robotMode]);

  const handleToggleRobot = React.useCallback(() => {
    if (robotMode) {
      // Desactiver le mode robot
      esp32Manager.stopRobotMode();
      esp32Manager.disconnect();
      setRobotMode(false);
    } else {
      // Activer le mode robot
      setRobotMode(true);
      esp32Manager.startRobotMode(
        async msg => {
          const text =
            typeof msg.payload === 'string'
              ? msg.payload
              : JSON.stringify(msg.payload);
          await handleSendPress({text, type: 'text'});
          return '';
        },
        '192.168.4.1',
        500,
      );
    }
  }, [robotMode, handleSendPress]);
  
  const [translationEnabled, setTranslationEnabled] = useState(false);

  const handleToggleTranslation = React.useCallback(() => {
    const enabled = translationService.toggleTranslation();
    setTranslationEnabled(enabled);
  }, []);

  React.useEffect(() => {
    const checkMultimodal = async () => {
      const enabled = await isMultimodalEnabled();
      setMultimodalEnabled(enabled);
    };

    checkMultimodal();
  }, [isMultimodalEnabled]);

  const thinkingSupported = modelStore.activeModel?.supportsThinking ?? false;

  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const activeSession = chatSessionStore.sessions.find(
    s => s.id === chatSessionStore.activeSessionId,
  );
  React.useEffect(() => {
    let cancelled = false;
    chatSessionStore.getCurrentCompletionSettings().then(settings => {
      if (!cancelled) {
        setThinkingEnabled(settings.enable_thinking ?? true);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chatSessionStore.activeSessionId,
    activeSession?.settingsSource,
    activeSession?.completionSettings,
    chatSessionStore.newChatCompletionSettings,
    chatSessionStore.newChatThinkingOverride,
    activePalId,
  ]);

  // Tool-compatibility one-time banner: when the active Pal declares
  // tools but the loaded model's jinja metadata signals no tool support
  // in any of its slots (see below), surface an inline warning.
  // Persisted per model id so the warning fires at most once.
  React.useEffect(() => {
    const palDeclaresTools =
      activePal?.pact?.talents !== undefined &&
      activePal.pact.talents.length > 0;
    if (!palDeclaresTools) {
      return;
    }
    const model = (modelStore.context as any)?.model;
    const modelId = modelStore.activeModelId;
    if (!model || !modelId) {
      return;
    }
    // Tool support surfaces in four independent places in llama.rn's
    // jinja metadata: defaultCaps.tools/toolCalls (model declares it
    // inline in the default template — Ministral, Llama 3.x, etc.) or
    // toolUse/toolUseCaps (separate tool-use template — Qwen3, etc.).
    // Any one is sufficient; only warn when all four are absent.
    const jinja = model.chatTemplates?.jinja;
    const hasToolSupport =
      !!jinja?.defaultCaps?.tools ||
      !!jinja?.defaultCaps?.toolCalls ||
      !!jinja?.toolUse ||
      !!jinja?.toolUseCaps;
    if (hasToolSupport) {
      return;
    }
    if (uiStore.hasWarnedToolCompat(modelId)) {
      return;
    }
    uiStore.setChatWarning({
      code: 'unknown',
      message: l10n.chat.toolCompatWarning,
      context: 'chat',
      recoverable: true,
      severity: 'warning',
      metadata: {modelId},
    });
    uiStore.markToolCompatWarned(modelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePalId, modelStore.activeModelId, modelStore.context]);

  const handleThinkingToggle = async (enabled: boolean) => {
    const currentSession = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );

    if (currentSession) {
      // Use resolved settings so pal overrides (temperature, etc.) are preserved
      const resolvedSettings =
        await chatSessionStore.getCurrentCompletionSettings();
      const updatedSettings = {
        ...resolvedSettings,
        enable_thinking: enabled,
      };
      await chatSessionStore.updateSessionCompletionSettings(updatedSettings);
    } else {
      // No active session: stage the user's choice on the new-chat
      // override field. Resolver applies it as the last layer so the
      // toggle persists; session creation bakes it in and births the
      // session as 'custom'. Does NOT touch newChatCompletionSettings or
      // newChatSettingsSource — pal's other params remain intact.
      runInAction(() => {
        chatSessionStore.newChatThinkingOverride = enabled;
      });
    }
  };

  // If the active pal is a video pal, show the video pal screen
  if (isVideoPal) {
    return <VideoPalScreen activePal={activePal} />;
  }

  // Otherwise, show the regular chat view
  return (
    <>
      {/* OUZAIF: Barre de connexion Robot ESP32 */}
      <TouchableOpacity
        onPress={handleToggleRobot}
        style={[
          robotStyles.bar,
          robotMode ? robotStyles.barActive : robotStyles.barInactive,
        ]}>
        <Text style={robotStyles.icon}>{robotMode ? '🤖' : '🔌'}</Text>
        <Text style={robotStyles.label}>
          {robotMode
            ? esp32Connected
              ? 'Robot connecte - Tap pour deconnecter'
              : 'Connexion robot...'
            : 'Connecter le Robot ESP32'}
        </Text>
        <View
          style={[
            robotStyles.dot,
            esp32Connected ? robotStyles.dotGreen : robotStyles.dotRed,
          ]}
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.translateButton,
          translationEnabled ? styles.translateActive : styles.translateInactive,
        ]}
        onPress={handleToggleTranslation}
      >
        <Text style={styles.translateButtonText}>
          {translationEnabled ? "🌍 HAUSA" : "🌍 Traduire"}
        </Text>
      </TouchableOpacity>
      <ChatView
        renderBubble={renderBubble}
        messages={chatSessionStore.currentSessionMessages}
        activePal={activePal}
        onSendPress={handleSendPress}
        onStopPress={handleStopPress}
        onPalSettingsSelect={handleOpenPalSheet}
        user={user}
        isStopVisible={modelStore.inferencing}
        isStreaming={modelStore.isStreaming}
        sendButtonVisibilityMode="always"
        showImageUpload={true}
        isVisionEnabled={multimodalEnabled}
        initialInputText={pendingMessage || undefined}
        onInitialTextConsumed={clearPendingMessage}
        inputProps={{
          showThinkingToggle: thinkingSupported,
          isThinkingEnabled: thinkingEnabled,
          onThinkingToggle: handleThinkingToggle,
        }}
        textInputProps={{
          placeholder: !modelStore.engine
            ? modelStore.isContextLoading
              ? l10n.chat.loadingModel
              : l10n.chat.modelNotLoaded
            : l10n.chat.typeYourMessage,
        }}
      />
      {uiStore.chatWarning && (
        <ErrorSnackbar
          error={uiStore.chatWarning}
          onDismiss={() => uiStore.clearChatWarning()}
        />
      )}
      {modelStore.modelLoadError && (
        <ErrorSnackbar
          error={modelStore.modelLoadError}
          onDismiss={() => modelStore.clearModelLoadError()}
          onReport={handleReportModelError}
        />
      )}
      <ModelErrorReportSheet
        isVisible={isErrorReportVisible}
        onClose={handleCloseErrorReport}
        error={errorToReport}
      />
      {activePal && (
        <PalSheet
          isVisible={isPalSheetVisible}
          onClose={handleClosePalSheet}
          pal={activePal}
        />
      )}
    </>
  );
});

const robotStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
    marginTop: 4,
    borderRadius: 8,
  },
  barActive: {
    backgroundColor: '#1a472a',
  },
  barInactive: {
    backgroundColor: '#2c2c2c',
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  label: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotGreen: {
    backgroundColor: '#00ff00',
  },
  dotRed: {
    backgroundColor: '#ff4444',
  },
});
