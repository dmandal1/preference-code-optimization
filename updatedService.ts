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
      className + methodName +
      ' start: Save preference for user ' +
      util.inspect(input, { depth: null, colors: false })
    );

    const existingPref = await this.preferenceDAO.getPreference(input.userId);

    const teamPrefs = this.mergeTeamPreferences(
      existingPref?.merchTeamPreference,
      input.merchTeamPreference,
      existingPref
    );

    const preference = existingPref
      ? this.updateExistingPreference(existingPref, input, teamPrefs)
      : this.createNewPreference(input, teamPrefs);

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
    logger.debug(className + methodName + ` start: Get preference for ${userId}`);

    const [error, result] = await TryCatch.execute(
      this.preferenceDAO.getPreference(userId)
    );

    if (error) {
      logger.error(className + methodName + ' error: ' + error);
      throwDAOFailedError();
    }

    if (!result) return null;

    const teamPrefs = this.mergeMissingTeams(result.merchTeamPreference, userTeams);

    logger.debug(className + methodName + ' end');
    return this.formatPreferenceResponse(result, teamPrefs);
  }

  // ---- Helper Methods ----

  private mergeTeamPreferences(
    existingTeams: MerchTeamPreference[] = [],
    incomingPrefs: { teamId: string; enableNotification: boolean }[],
    existingPrefEntity?: any
  ): MerchTeamPreference[] {
    const incomingMap = new Map(
      incomingPrefs.map(t => [t.teamId, t.enableNotification])
    );

    const updatedTeams: MerchTeamPreference[] = [];

    for (const team of existingTeams) {
      if (incomingMap.has(team.teamId)) {
        team.enableNotification = incomingMap.get(team.teamId)!;
        incomingMap.delete(team.teamId);
      } else {
        team.enableNotification = false;
      }
      updatedTeams.push(team);
    }

    for (const [teamId, enableNotification] of incomingMap.entries()) {
      const newTeam = new MerchTeamPreference();
      newTeam.teamId = teamId;
      newTeam.enableNotification = enableNotification;
      if (existingPrefEntity) newTeam.preferenceId = existingPrefEntity;
      updatedTeams.push(newTeam);
    }

    return updatedTeams;
  }

  private mergeMissingTeams(
    teamPrefs: MerchTeamPreference[] = [],
    userTeams: string[] = []
  ): MerchTeamPreference[] {
    const existingTeamIds = new Set(teamPrefs.map(t => t.teamId));
    const result = [...teamPrefs];

    for (const teamId of userTeams) {
      if (!existingTeamIds.has(teamId)) {
        const newTeam = new MerchTeamPreference();
        newTeam.teamId = teamId;
        newTeam.enableNotification = true;
        result.push(newTeam);
      }
    }

    return result;
  }

  private updateExistingPreference(
    existing: any,
    input: PreferencePayload,
    teamPrefs: MerchTeamPreference[]
  ) {
    existing.inAppNotification = input.inAppNotification;
    existing.emailNotification = input.emailNotification;
    existing.emailFrequency = input.emailFrequency;
    existing.merchTeamPreference = teamPrefs;
    return existing;
  }

  private createNewPreference(
    input: PreferencePayload,
    teamPrefs: MerchTeamPreference[]
  ) {
    return {
      userId: input.userId,
      inAppNotification: input.inAppNotification,
      emailNotification: input.emailNotification,
      emailFrequency: input.emailFrequency,
      merchTeamPreference: teamPrefs,
    };
  }

  private formatPreferenceResponse(
    source: any,
    teamPrefs?: MerchTeamPreference[]
  ): PreferencePayload {
    return {
      userId: source.userId,
      inAppNotification: source.inAppNotification,
      emailNotification: source.emailNotification,
      emailFrequency: source.emailFrequency,
      merchTeamPreference: (teamPrefs || source.merchTeamPreference || []).map(
        (pref: MerchTeamPreference) => ({
          teamId: pref.teamId,
          enableNotification: pref.enableNotification,
        })
      ),
    };
  }
}
