export interface MerchTeamsPreferenceInput {
  teamId: string;
  enableNotification: boolean;
}

export interface CreatePreferencePayload {
  userId: string;
  inAppNotification: boolean;
  emailNotification: boolean;
  emailFrequency: number;
  merchTeamPreference: MerchTeamsPreferenceInput[];
}
