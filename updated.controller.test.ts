import { Request, Response } from 'express';
import { PreferenceController } from '../../src/server/controller/preference.controller';
import { PreferenceService } from '../../src/server/service/preference.service';
import { EmailFrequency } from '../../src/server/enum/email.frequency.enum';
import { PreferencePayload } from '../../src/server/type/preference.payload.type';

jest.mock('../../src/server/service/preference.service');

describe('Preference Controller test cases', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      user: { email: 'dummy', merchandisingTeams: ['team1', 'team2'] },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return preferences successfully', async () => {
    const mockService = {
      getPreference: jest.fn().mockResolvedValue({ success: true }),
    };

    (PreferenceService.createInstance as jest.Mock).mockResolvedValue(
      mockService
    );

    req.params = { userId: 'dummy' };

    const controller = await PreferenceController.createInstance();
    await controller.getPreference(req as Request, res as Response, next);

    expect(mockService.getPreference).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('should handle error when getPreference fails', async () => {
    const mockService = {
      getPreference: jest.fn().mockRejectedValue(new Error('Something went wrong')),
    };

    (PreferenceService.createInstance as jest.Mock).mockResolvedValue(
      mockService
    );

    req.params = { userId: 'dummy' };

    const controller = await PreferenceController.createInstance();
    await controller.getPreference(req as Request, res as Response, next);

    expect(mockService.getPreference).toHaveBeenCalled();
    expect(next).toHaveBeenCalled(); // Ensure error was forwarded
  });

  it('should save preferences successfully', async () => {
    const payload: PreferencePayload = {
      userId: 'user1',
      inAppNotification: true,
      emailNotification: true,
      emailFrequency: EmailFrequency.DAILY,
      merchTeamPreference: [
        { teamId: 'team1', enableNotification: true },
        { teamId: 'team2', enableNotification: false },
      ],
    };

    req.body = payload;

    const mockService = {
      savePreference: jest.fn().mockResolvedValue(payload),
    };

    (PreferenceService.createInstance as jest.Mock).mockResolvedValue(
      mockService
    );

    const controller = await PreferenceController.createInstance();
    await controller.savePreference(req as Request, res as Response, next);

    expect(mockService.savePreference).toHaveBeenCalledWith(payload);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  it('should handle error when savePreference fails', async () => {
    const payload: PreferencePayload = {
      userId: 'user1',
      inAppNotification: true,
      emailNotification: true,
      emailFrequency: EmailFrequency.DAILY,
      merchTeamPreference: [],
    };

    req.body = payload;

    const mockService = {
      savePreference: jest.fn().mockRejectedValue(new Error('Save failed')),
    };

    (PreferenceService.createInstance as jest.Mock).mockResolvedValue(
      mockService
    );

    const controller = await PreferenceController.createInstance();
    await controller.savePreference(req as Request, res as Response, next);

    expect(mockService.savePreference).toHaveBeenCalledWith(payload);
    expect(next).toHaveBeenCalled(); // Error should be passed to next()
  });
});
