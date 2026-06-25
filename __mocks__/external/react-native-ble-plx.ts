// Mock pour react-native-ble-plx
export const BleManager = jest.fn().mockImplementation(() => ({
  startDeviceScan: jest.fn(),
  stopDeviceScan: jest.fn(),
  connectToDevice: jest.fn().mockResolvedValue({
    discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue({}),
    monitorCharacteristicForService: jest.fn(),
    writeCharacteristicWithResponseForService: jest.fn().mockResolvedValue({}),
    cancelConnection: jest.fn().mockResolvedValue({}),
  }),
  destroy: jest.fn(),
}));

export const State = {
  PoweredOn: 'PoweredOn',
  PoweredOff: 'PoweredOff',
  Unauthorized: 'Unauthorized',
};

export const Device = jest.fn();
