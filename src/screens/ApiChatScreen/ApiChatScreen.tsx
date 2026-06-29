import React, { useState } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { observer } from 'mobx-react-lite';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export const ApiChatScreen = observer(() => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // Simulation d'appel API
      const response = await new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('API: ' + userMessage.content + ' (réponse simulée)');
        }, 1000);
      });
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response || 'Pas de réponse'
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'envoi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
        </View>
      )}
      
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[
            styles.messageBubble,
            item.role === 'user' ? styles.userBubble : styles.assistantBubble
          ]}>
            <Text style={styles.messageText}>{item.content}</Text>
          </View>
        )}
        contentContainerStyle={styles.chatContainer}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Écrivez votre message API..."
          editable={!loading}
        />
        {loading ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <Button
            title="Envoyer"
            onPress={sendMessage}
            disabled={!input.trim()}
          />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  chatContainer: {
    padding: 16,
    paddingBottom: 80,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    backgroundColor: '#E5E5EA',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  errorContainer: {
    backgroundColor: '#FF3B30',
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
