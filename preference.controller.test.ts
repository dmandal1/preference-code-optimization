import { PreferenceController } from './../../src/server/controller/preference.controller';
import { Request, Response } from 'express';
import { PreferencePayload } from '../../src/server/type/preference.payload.type';
import { EmailFrequency } from '../../src/server/enum/email.frequency.enum';

const getPreferenceService = (throwError: Boolean = false) => {
  const service = require('../../src/server/service/preference.service')
    .PreferenceService;
  service.createInstance = async () => {
    return {
      getPreference: throwError
        ? jest.fn().mockReturnValue(Promise.reject('ERROR'))
        : jest.fn().mockResolvedValue({}),
      savePreference: throwError
        ? jest.fn().mockReturnValue(Promise.reject('ERROR'))
        : jest.fn().mockResolvedValue({}),
    };
  };
  return service;
};

const getPreferenceController = () =>
  require('../../src/server/controller/preference.controller')
    .PreferenceController;

describe('Preference Controller test cases', () => {
  it('Preference controller create instance method passed', async () => {
    const preferenceController = PreferenceController.createInstance();
    expect(preferenceController).toBeTruthy();
  });

  it('preference controller create instance method passed', async () => {
    const preferenceController = getPreferenceController().createInstance();
    expect(preferenceController).toBeTruthy();
  }),
    it('preference controller get preference method passed', async () => {
      const request = {} as Request;
      const response = {} as Response;
      // response.set = jest.fn().mockReturnThis();
      response.status = jest.fn().mockReturnThis();
      response.json = jest.fn().mockReturnThis();
      const nextFunc = jest.fn();
      request.params = { userId: 'dummy' };

      // Throw Error
      getPreferenceService(true);
      await getPreferenceController()
        .createInstance()
        .getPreference(request, response, nextFunc);

      // No Error
      getPreferenceService(false);
      await getPreferenceController()
        .createInstance()
        .getPreference(request, response, nextFunc);

      expect(response.status).toBeCalled();
      expect(response.json).toBeCalled();
    });

  it('preference controller get preference method passed when userId is null', async () => {
    const request = {} as Request;
    const response = {} as Response;
    // response.set = jest.fn().mockReturnThis();
    response.status = jest.fn().mockReturnThis();
    response.json = jest.fn().mockReturnThis();
    const nextFunc = jest.fn();
    request.params = { userId: '' };

    // Throw Error
    getPreferenceService(true);
    await getPreferenceController()
      .createInstance()
      .getPreference(request, response, nextFunc);

    // No Error
    getPreferenceService(false);
    await getPreferenceController()
      .createInstance()
      .getPreference(request, response, nextFunc);

    expect(response.status).toBeCalled();
  });

  it('preference service save preference method passed', async () => {
    const request = {} as Request;
    const response = {} as Response;
    response.status = jest.fn().mockReturnThis();
    response.json = jest.fn().mockReturnThis();
    const nextFunc = jest.fn();

    const preferencePayload: PreferencePayload = {
      userId: 'user1',
      inAppNotification: true,
      emailNotification: true,
      emailFrequency: EmailFrequency.DAILY,
      merchTeamPreference: [
        { teamId: 'team1', enableNotification: true },
        { teamId: 'team2', enableNotification: false },
      ],
    };

    request.body = preferencePayload;

    const mockPreferenceService = {
      savePreference: jest.fn().mockResolvedValue(preferencePayload),
    };

    jest
      .spyOn(getPreferenceService(), 'createInstance')
      .mockReturnValue(mockPreferenceService);

    await getPreferenceController()
      .createInstance()
      .savePreference(request, response, nextFunc);

    expect(mockPreferenceService.savePreference).toHaveBeenCalledWith(
      preferencePayload
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });
});
