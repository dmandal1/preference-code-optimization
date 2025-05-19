import { PreferenceController } from '../../src/server/controller/preference.controller';
import { Request, Response } from 'express';
import { EmailFrequency } from '../../src/server/enum/email.frequency.enum';
import * as typeorm from 'typeorm';

// Mock PreferenceService
const getPreferenceService = (throwError: boolean = false) => {
  const service = require('../../src/server/service/preference.service').PreferenceService;
  service.createInstance = async () => {
    return {
      getPreference: throwError
        ? jest.fn().mockRejectedValue('ERROR')
        : jest.fn().mockResolvedValue({}),
      savePreference: throwError
        ? jest.fn().mockRejectedValue('ERROR')
        : jest.fn().mockResolvedValue({}),
    };
  };
  return service;
};

// Mock getManager().query() to avoid DB dependency
const mockGetManager = () => {
  jest.spyOn(typeorm, 'getManager').mockReturnValue({
    query: jest.fn().mockResolvedValue([
      { teamId: 'team1' },
      { teamId: 'team2' },
      { teamId: 'team3' },
    ]),
  } as any);
};

describe('Preference Controller test cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetManager();
  });

  it('PreferenceController.createInstance() should return a controller instance', async () => {
    const controller = PreferenceController.createInstance();
    expect(controller).toBeTruthy();
  });

  it('getPreference() should handle success and error cases properly', async () => {
    const request = {
      params: { userId: 'dummyUser' },
      user: {
        email: 'dummyUser',
        merchandisingTeams: ['team1', 'team2', 'invalidTeam'],
      },
    } as unknown as Request;

    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    const nextFunc = jest.fn();

    // Error case
    getPreferenceService(true);
    await PreferenceController.createInstance().getPreference(request, response, nextFunc);
    expect(response.status).toHaveBeenCalled();

    // Success case
    getPreferenceService(false);
    await PreferenceController.createInstance().getPreference(request, response, nextFunc);
    expect(response.status).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalled();
  });

  it('getPreference() should handle when userId is null or empty', async () => {
    const request = {
      params: { userId: '' },
      user: {
        email: '',
        merchandisingTeams: ['team1'],
      },
    } as unknown as Request;

    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    const nextFunc = jest.fn();

    getPreferenceService(true);
    await PreferenceController.createInstance().getPreference(request, response, nextFunc);
    expect(response.status).toHaveBeenCalled();

    getPreferenceService(false);
    await PreferenceController.createInstance().getPreference(request, response, nextFunc);
    expect(response.status).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalled();
  });

  it('savePreference() should call service and return success', async () => {
    const request = {
      body: {
        userId: 'user1',
        inAppNotification: true,
        emailNotification: true,
        emailFrequency: EmailFrequency.DAILY,
        merchTeamPreference: [
          { teamId: 'team1', enableNotification: true },
          { teamId: 'team2', enableNotification: false },
        ],
      },
      user: { email: 'user1' },
    } as unknown as Request;

    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    const nextFunc = jest.fn();

    const mockService = {
      savePreference: jest.fn().mockResolvedValue(request.body),
    };

    jest.spyOn(require('../../src/server/service/preference.service').PreferenceService, 'createInstance')
      .mockResolvedValue(mockService);

    await PreferenceController.createInstance().savePreference(request, response, nextFunc);

    expect(mockService.savePreference).toHaveBeenCalledWith(request.body);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalled();
  });
});
