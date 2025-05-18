import { MerchTeamPreference } from '../dao/entity/merchTeamPreference.entity';
import { PreferenceDAO } from '../dao/preference.dao';
import { TryCatch } from '../utility/tryCatch';
import { throwDAOFailedError } from '../utility/customErrors';
import { PreferencePayload } from '../type/preference.payload.type';
import util from 'util';
const logger = require('../logger');
const className = '[PreferenceService]';

export class PreferenceService {
  static async createInstance() {
    return new PreferenceService();
  }

  private readonly preferenceDAO = PreferenceDAO.createInstance();

  async savePreference(input: PreferencePayload) {
    const methodName = '[savePreference]';
    logger.debug(
      className +
        methodName +
        'start: Save the preference with data ' +
        util.inspect(input, { depth: null, colors: false })
    );

    const existingPref = await this.preferenceDAO.getPreference(input.userId);
    let preference;
    if (existingPref) {
      existingPref.inAppNotification = input.inAppNotification;
      existingPref.emailNotification = input.emailNotification;
      existingPref.emailFrequency = input.emailFrequency;

      const incomingTeamMap = new Map<string, boolean>(
        input.merchTeamPreference.map(t => [t.teamId, t.enableNotification])
      );

      const updatedTeamPrefs: MerchTeamPreference[] = [];
      for (const team of existingPref.merchTeamPreference) {
        if (incomingTeamMap.has(team.teamId)) {
          team.enableNotification = incomingTeamMap.get(team.teamId)!;
          incomingTeamMap.delete(team.teamId);
        } else {
          team.enableNotification = false;
        }
        updatedTeamPrefs.push(team);
      }

      for (const [teamId, enableNotification] of Array.from(
        incomingTeamMap.entries()
      )) {
        const newTeam = new MerchTeamPreference();
        newTeam.teamId = teamId;
        newTeam.enableNotification = enableNotification;
        newTeam.preferenceId = existingPref;
        updatedTeamPrefs.push(newTeam);
      }

      existingPref.merchTeamPreference = updatedTeamPrefs;
      preference = existingPref;
    } else {
      preference = {
        userId: input.userId,
        inAppNotification: input.inAppNotification,
        emailNotification: input.emailNotification,
        emailFrequency: input.emailFrequency,
        merchTeamPreference: input.merchTeamPreference.map(t => {
          const team = new MerchTeamPreference();
          team.teamId = t.teamId;
          team.enableNotification = t.enableNotification;
          return team;
        }),
      };
    }

    const [error, result] = await TryCatch.execute(
      this.preferenceDAO.savePreference(preference)
    );

    if (error) {
      logger.error(className + methodName + 'error: ' + error);
      throwDAOFailedError();
    }

    logger.debug(className + methodName + 'end');

    return this.formatPreferenceResponse(result);
  }

  async getPreference(userId: string, userTeams: string[]) {
    const methodName = '[getPreference]';
    logger.debug(
      className +
        methodName +
        'start: Get the preference of user with userId ' +
        userId
    );
    const [error, result] = await TryCatch.execute(
      this.preferenceDAO.getPreference(userId)
    );

    if (error) {
      logger.error(className + methodName + 'error: ' + error);
      throwDAOFailedError();
    }

    if (!result) return null;

    const teamPrefs: MerchTeamPreference[] = result.merchTeamPreference ?? [];
    const existingTeamIds = new Set(teamPrefs.map(t => t.teamId));

    const mergedTeamPrefs = [...teamPrefs];
    for (const teamId of userTeams) {
      if (!existingTeamIds.has(teamId)) {
        const newTeam = new MerchTeamPreference();
        newTeam.teamId = teamId;
        newTeam.enableNotification = true;
        mergedTeamPrefs.push(newTeam);
      }
    }

    logger.debug(className + methodName + 'end');
    return this.formatPreferenceResponse(result, mergedTeamPrefs);
  }

  private formatPreferenceResponse(source: any, merchTeamPrefs?: MerchTeamPreference[]) : PreferencePayload{
    return {
      userId: source.userId,
      inAppNotification: source.inAppNotification,
      emailNotification: source.emailNotification,
      emailFrequency: source.emailFrequency,
      merchTeamPreference: (merchTeamPrefs || source.merchTeamPreference || []).map((pref: MerchTeamPreference) => ({
        teamId: pref.teamId,
        enableNotification: pref.enableNotification,
      })),
    };
  }
}
