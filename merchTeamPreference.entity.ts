import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Preference } from './preference.entity';

@Entity({ name: 'merch_team_preferences' })
export class MerchTeamPreference {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'team_id', type: 'varchar', nullable: false })
  teamId!: string;

  @Column({
    name: 'enable_notification',
    type: 'boolean',
    default: true,
    nullable: false,
  })
  enableNotification!: boolean;

  @ManyToOne(
    () => Preference,
    preference => preference.merchTeamPreference,
    {
      onDelete: 'CASCADE',
    }
  )
  @JoinColumn({ name: 'preference_id' })
  preferenceId!: Preference;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'NOW()',
    nullable: false,
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'NOW()',
    nullable: true,
  })
  updatedAt!: Date;
}
