import { PreferenceController } from './../../src/server/controller/preference.controller';
import { Request, Response } from 'express';
import { EmailFrequency } from '../../src/server/enum/email.frequency.enum';

// Mock typeorm getManager to avoid DB connection errors
jest.mock('typeorm', () => ({
  getManager: jest.fn(() => ({
    query: jest.fn().mockResolvedValue([
      { teamId: 'team1' },
      { teamId: 'team2' },
    ]),
  })),
}));

// Mock PreferenceService
const mockGetPreference = jest.fn();
const mockSavePreference = jest.fn();

jest.mock('../../src/server/service/preference.service', () => {
  return {
    PreferenceService: {
      createInstance: jest.fn(() =>
        Promise.resolve({
          getPreference: mockGetPreference,
          savePreference: mockSavePreference,
        })
      ),
    },
  };
});

describe('Preference Controller test cases', () => {
  let controller: PreferenceController;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  beforeEach(() => {
    controller = PreferenceController.createInstance();
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();

    mockGetPreference.mockReset();
    mockSavePreference.mockReset();
  });

  it('Preference controller create instance method passed', () => {
    expect(controller).toBeTruthy();
  });

  it('preference controller get preference method - success', async () => {
    const fakePref = {
      userId: 'user@example.com',
      inAppNotification: true,
      emailNotification: false,
      emailFrequency: EmailFrequency.DAILY,
      merchTeamPreference: [
        { teamId: 'team1', enableNotification: true },
        { teamId: 'team2', enableNotification: false },
      ],
    };

    mockGetPreference.mockResolvedValue(fakePref);

    req.user = {
      email: 'user@example.com',
      merchandisingTeams: ['team1', 'team2', 'invalid-team'],
    };
    req.params = {};

    await controller.getPreference(req as Request, res as Response, next);

    expect(mockGetPreference).toHaveBeenCalledWith(
      'user@example.com',
      ['team1', 'team2'] // filtered valid teams
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: fakePref,
      })
    );
  });

  it('preference controller get preference method - no saved preference', async () => {
    // When getPreference returns null, controller returns defaults
    mockGetPreference.mockResolvedValue(null);

    req.user = {
      email: 'user@example.com',
      merchandisingTeams: ['team1', 'team2'],
    };
    req.params = {};

    await controller.getPreference(req as Request, res as Response, next);

    expect(mockGetPreference).toHaveBeenCalledWith(
      'user@example.com',
      ['team1', 'team2']
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          userId: 'user@example.com',
          inAppNotification: true,
          emailNotification: false,
          emailFrequency: EmailFrequency.NEVER,
          merchTeamPreference: [
            { teamId: 'team1', enableNotification: true },
            { teamId: 'team2', enableNotification: true },
          ],
        }),
      })
    );
  });

  it('preference controller get preference method - error from service', async () => {
    mockGetPreference.mockRejectedValue(new Error('DB error'));

    req.user = {
      email: 'user@example.com',
      merchandisingTeams: ['team1'],
    };
    req.params = {};

    await controller.getPreference(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Internal Server Error'),
      })
    );
  });

  it('preference controller save preference method - success', async () => {
    const inputPayload = {
      userId: 'user1',
      inAppNotification: true,
      emailNotification: true,
      emailFrequency: EmailFrequency.DAILY,
      merchTeamPreference: [
        { teamId: 'team1', enableNotification: true },
        { teamId: 'team2', enableNotification: false },
      ],
    };

    mockSavePreference.mockResolvedValue(inputPayload);

    req.user = { email: 'user1' };
    req.body = { ...inputPayload, userId: '' };

    await controller.savePreference(req as Request, res as Response, next);

    expect(mockSavePreference).toHaveBeenCalledWith({
      ...inputPayload,
      userId: 'user1', // controller sets userId from req.user.email
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: inputPayload,
      })
    );
  });

  it('preference controller save preference method - error from service', async () => {
    mockSavePreference.mockRejectedValue(new Error('Save failed'));

    req.user = { email: 'user1' };
    req.body = {
      userId: '',
      inAppNotification: true,
      emailNotification: true,
      emailFrequency: EmailFrequency.DAILY,
      merchTeamPreference: [],
    };

    await controller.savePreference(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Internal Server Error'),
      })
    );
  });
});
