import { getRepository } from 'typeorm';
import { Preference } from './entity/preference.entity';
import { CreatePreferencePayload } from '../type/preference.payload.type';
import util from 'util';
const logger = require('../logger');

const className = '[PreferenceDAO]';

export class PreferenceDAO {
  static createInstance() {
    return new PreferenceDAO();
  }

  private readonly preferenceRepository = getRepository(Preference);

  async getPreference(userId: string) {
    const methodName = '[getPreference]';
    logger.debug(
      className +
        methodName +
        'start: Fetch the preferences of user with userId ' +
        userId
    );
    return this.preferenceRepository.findOne({
      where: { userId },
      relations: ['merchTeamPreference'],
    });
  }

  async savePreference(obj: CreatePreferencePayload) {
    const methodName = '[savePreference]';
    logger.debug(
      className +
        methodName +
        'start: Save the preferences ' +
        util.inspect(obj, { depth: 2, colors: false, showHidden: false })
    );
    return this.preferenceRepository.save(obj);
  }
}
