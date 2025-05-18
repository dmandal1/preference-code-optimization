import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { EmailFrequency } from '../../enum/email.frequency.enum';
import { MerchTeamPreference } from './merchTeamPreference.entity';

/**
 *
 *
 *
 */
@Entity({ name: 'preferences' })
export class Preference {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'user_id', length: 100, unique: true })
  userId!: string;

  @Column({ name: 'in_app_notification', default: true })
  inAppNotification!: boolean;

  @Column({ name: 'email_notification', default: false })
  emailNotification!: boolean;

  @Column({
    name: 'email_frequency',
    enum: EmailFrequency,
    default: EmailFrequency.NEVER,
  })
  emailFrequency!: number;

  @OneToMany(
    () => MerchTeamPreference,
    m => m.preferenceId,
    {
      cascade: true,
      eager: true,
    }
  )
  merchTeamPreference!: MerchTeamPreference[];
}
