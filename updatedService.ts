import { MerchTeamPreference } from '../dao/entity/merchTeamPreference.entity';
import { PreferenceDAO } from '../dao/preference.dao';
import { TryCatch } from '../utility/tryCatch';
import { throwDAOFailedError } from '../utility/customErrors';
import { CreatePreferencePayload } from '../type/preference.payload.type';
import util from 'util';

const logger = require('../logger');
const className = '[PreferenceService]';

export class PreferenceService {
  static async createInstance() {
    return new PreferenceService();
  }

  private readonly preferenceDAO = PreferenceDAO.createInstance();

  async savePreference(input: CreatePreferencePayload) {
    const methodName = '[savePreference]';
    logger.debug(
      className +
        methodName +
        ' start: Save the preference with data ' +
        util.inspect(input, { depth: null, colors: false })
    );

    const existingPref = await this.preferenceDAO.getPreference(input.userId);
    const preference = existingPref
      ? this.updateExistingPreference(existingPref, input)
      : this.createNewPreference(input);

    const [error, result] = await TryCatch.execute(
      this.preferenceDAO.savePreference(preference)
    );

    if (error) {
      logger.error(className + methodName + ' error: ' + error);
      throwDAOFailedError();
    }

    logger.debug(className + methodName + ' end');
    return this.formatPreferenceResponse(result);
  }

  async getPreference(userId: string, userTeams: string[]) {
    const methodName = '[getPreference]';
    logger.debug(
      className + methodName + ' start: Get the preference of user with userId ' + userId
    );

    const [error, result] = await TryCatch.execute(
      this.preferenceDAO.getPreference(userId)
    );

    if (error) {
      logger.error(className + methodName + ' error: ' + error);
      throwDAOFailedError();
    }

    if (!result) return null;

    const teamPrefs = result.merchTeamPreference ?? [];
    const existingMap = new Map(teamPrefs.map(t => [t.teamId, t]));

    for (const teamId of userTeams) {
      if (!existingMap.has(teamId)) {
        const newTeam = new MerchTeamPreference();
        newTeam.teamId = teamId;
        newTeam.enableNotification = true;
        teamPrefs.push(newTeam);
      }
    }

    result.merchTeamPreference = teamPrefs;

    logger.debug(className + methodName + ' end');
    return this.formatPreferenceResponse(result);
  }

  private updateExistingPreference(existing, input: CreatePreferencePayload) {
    existing.inAppNotification = input.inAppNotification;
    existing.emailNotification = input.emailNotification;
    existing.emailFrequency = input.emailFrequency;

    const incomingMap = new Map(input.merchTeamPreference.map(t => [t.teamId, t.enableNotification]));
    const existingMap = new Map(existing.merchTeamPreference.map(t => [t.teamId, t]));

    const mergedPrefs: MerchTeamPreference[] = [];

    for (const [teamId, enableNotification] of incomingMap.entries()) {
      const existingTeam = existingMap.get(teamId);
      if (existingTeam) {
        existingTeam.enableNotification = enableNotification;
        mergedPrefs.push(existingTeam);
        existingMap.delete(teamId);
      } else {
        mergedPrefs.push(
          Object.assign(new MerchTeamPreference(), {
            teamId,
            enableNotification,
            preferenceId: existing,
          })
        );
      }
    }

    // Set enableNotification = false for teams not present in input
    for (const remainingTeam of existingMap.values()) {
      remainingTeam.enableNotification = false;
      mergedPrefs.push(remainingTeam);
    }

    existing.merchTeamPreference = mergedPrefs;
    return existing;
  }

  private createNewPreference(input: CreatePreferencePayload) {
    return {
      userId: input.userId,
      inAppNotification: input.inAppNotification,
      emailNotification: input.emailNotification,
      emailFrequency: input.emailFrequency,
      merchTeamPreference: input.merchTeamPreference.map(t =>
        Object.assign(new MerchTeamPreference(), {
          teamId: t.teamId,
          enableNotification: t.enableNotification,
        })
      ),
    };
  }

  private formatPreferenceResponse(preference): any {
    return {
      userId: preference.userId,
      inAppNotification: preference.inAppNotification,
      emailNotification: preference.emailNotification,
      emailFrequency: preference.emailFrequency,
      merchTeamPreference: preference.merchTeamPreference?.map(pref => ({
        teamId: pref.teamId,
        enableNotification: pref.enableNotification,
      })),
    };
  }
}
