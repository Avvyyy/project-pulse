import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SearchModule } from './search/search.module';
import { StorageModule } from './storage/storage.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { EventsModule } from './events/events.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { HealthModule } from './health/health.module';
import { QueryModule } from './query/query.module';
import { IncidentsModule } from './incidents/incidents.module';
import { AlertsModule } from './alerts/alerts.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal:    true,
      load:        [configuration],
      envFilePath: ['.env'],
    }),

    ScheduleModule.forRoot(),

    BullModule.forRootAsync({
      imports:    [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host:     config.get<string>('redis.host', 'localhost'),
          port:     config.get<number>('redis.port', 6379),
          password: config.get<string>('redis.password') || undefined,
          db:       config.get<number>('redis.db', 0),
        },
      }),
      inject: [ConfigService],
    }),

    // @Global modules — injected everywhere without re-importing
    PrismaModule,
    RedisModule,
    SearchModule,
    StorageModule,
    PipelineModule,

    EventsModule,
    ApiKeysModule,
    QueryModule,
    IncidentsModule,
    AlertsModule,
    DashboardModule,
    HealthModule,
  ],
})
export class AppModule {}
