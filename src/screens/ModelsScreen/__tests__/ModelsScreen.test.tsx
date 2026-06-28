import React from 'react';
import {Alert} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';
import {
  fireEvent,
  render as baseRender,
  waitFor,
  act,
} from '../../../../jest/test-utils';
import {ModelsScreen} from '../ModelsScreen';
import {modelStore} from '../../../store';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {
    withBottomSheetProvider: true,
    withNavigation: true,
    ...options,
  });

jest.useFakeTimers();

describe('ModelsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', async () => {
    const {getByTestId} = render(<ModelsScreen />);
    expect(getByTestId('flat-list')).toBeTruthy();
    expect(getByTestId('fab-group')).toBeTruthy();
  });

  it('refreshes models on pull-to-refresh', async () => {
    const {getByTestId} = render(<ModelsScreen />);
    const flatList = getByTestId('flat-list');
    await act(async () => {
      flatList.props.refreshControl.props.onRefresh();
    });
    expect(modelStore.refreshDownloadStatuses).toHaveBeenCalled();
  });

  it('opens HF model search when the HF FAB is pressed', async () => {
    const {getByTestId} = render(<ModelsScreen />);
    fireEvent.press(getByTestId('fab-group'));
    await waitFor(() => {
      expect(getByTestId('hf-fab', {includeHiddenElements: true})).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId('hf-fab', {includeHiddenElements: true}));
    });
    await waitFor(() => {
      expect(getByTestId('hf-model-search-view')).toBeTruthy();
    });
  });

  it('adds a local model when the plus FAB is pressed', async () => {
    (pick as jest.Mock).mockResolvedValue([{uri: '/mock/file/path', name: 'mockModelFile.bin'}]);
    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) => !path.includes('local/mockModelFile.bin'));
    
    const {getByTestId} = render(<ModelsScreen />);
    fireEvent.press(getByTestId('fab-group'));
    
    await waitFor(() => expect(getByTestId('local-fab', {includeHiddenElements: true})).toBeTruthy());
    
    await act(async () => {
      fireEvent.press(getByTestId('local-fab', {includeHiddenElements: true}));
    });
    
    await waitFor(() => {
      expect(pick).toHaveBeenCalled();
      expect(RNFS.copyFile).toHaveBeenCalled();
    });
  });
});
