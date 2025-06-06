import { NextFunction, Request, Response } from 'express';
import httpStatusCodes from 'http-status-codes';
import { PreferenceService } from '../service/preference.service';
import { CreatePreferencePayload } from '../type/preference.payload.type';
import { HttpResponse } from '../utility/http.response';
import { EmailFrequency } from '../enum/email.frequency.enum';
import { Utils } from '../utility/utils';
import { TryCatch } from '../utility/tryCatch';
import util from 'util';
import { getManager } from 'typeorm';

const logger = require('../logger');
const className = '[PreferenceController]';

export class PreferenceController {
  static createInstance() {
    return new PreferenceController();
  }

  // Arrow function: keeps 'this' context
  private getValidTeamIds = async (): Promise<string[]> => {
    const entityManager = getManager();
    const result = await entityManager.query(
      'SELECT team_id as "teamId" FROM pcp.merchandising_teams;'
    );
    return result.map((team: { teamId: string }) => team.teamId);
  };

  // Arrow function: keeps 'this' context
  getPreference = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const methodName = '[getPreference]';
    logger.debug(
      className +
        methodName +
        ' start: Request user is ' +
        Utils.stringify(request.user)
    );

    const userId: string = request.user
      ? request.user.email
      : request.params.userId;
    const userTeams: string[] = request.user?.merchandisingTeams ?? [];

    const validTeamIds: string[] = await this.getValidTeamIds();
    const filteredUserTeams = userTeams.filter((teamId) =>
      validTeamIds.includes(teamId)
    );

    const preferenceService = await PreferenceService.createInstance();

    let [, result] = await TryCatch.execute(
      preferenceService.getPreference(userId, filteredUserTeams)
    );
    const [error] = await TryCatch.execute(
      preferenceService.getPreference(userId, filteredUserTeams)
    );

    if (error) {
      return HttpResponse.InternalServerError(
        response,
        className + methodName,
        error
      );
    }

    if (!result) {
      result = {
        userId,
        inAppNotification: true,
        emailNotification: false,
        emailFrequency: EmailFrequency.NEVER,
        merchTeamPreference: filteredUserTeams.map((teamId) => ({
          teamId,
          enableNotification: true,
        })),
      };
    }

    HttpResponse.setResponse(
      response,
      true,
      httpStatusCodes.OK,
      '',
      className + methodName,
      result
    );

    logger.info(className + methodName + ' end');
  };

  // Arrow function: keeps 'this' context
  savePreference = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const methodName = '[savePreference]';
    logger.debug(
      className +
        methodName +
        ' start: Request user is ' +
        util.inspect(request.user, { depth: null, colors: false })
    );

    const userId: string = request.user ? request.user.email : '';
    const input: CreatePreferencePayload = request.body;
    if (userId) {
      input.userId = userId;
    }

    const preferenceService = await PreferenceService.createInstance();

    const [error, result] = await TryCatch.execute(
      preferenceService.savePreference(input)
    );

    if (error) {
      return HttpResponse.InternalServerError(
        response,
        className + methodName,
        error
      );
    }

    HttpResponse.setResponse(
      response,
      true,
      httpStatusCodes.OK,
      '',
      className + methodName,
      result
    );

    logger.info(className + methodName + ' end');
  };
}
