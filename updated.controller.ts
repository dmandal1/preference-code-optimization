export class PreferenceController {
  static createInstance() {
    return new PreferenceController();
  }

  private getValidTeamIds = async (): Promise<string[]> => {
    const entityMangager = getManager();
    const result = await entityMangager.query(
      'SELECT team_id as "teamId" FROM pcp.merchandising_teams;'
    );
    return result.map((team: { teamId: string }) => team.teamId);
  };

  getPreference = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const methodName = '[getPreference]';
    const userId: string = request.user
      ? request.user.email
      : request.params.userId;
    const userTeams: string[] = request.user?.merchandisingTeams ?? [];
    const validTeamIds: string[] = await this.getValidTeamIds(); // this will now work
    const filteredUserTeams = userTeams.filter(teamId =>
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
        merchTeamPreference: filteredUserTeams.map(teamId => ({
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
  };

  savePreference = async (
    request: Request,
    response: Response,
    next: NextFunction
  ) => {
    const methodName = '[savePreference]';
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
  };
}
