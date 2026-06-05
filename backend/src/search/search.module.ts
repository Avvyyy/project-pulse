import { Global, Module } from '@nestjs/common';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SearchService } from './search.service';

@Global()
@Module({
  imports: [
    ElasticsearchModule.registerAsync({
      imports:    [ConfigModule],
      useFactory: (config: ConfigService) => ({
        node: config.get<string>('elasticsearch.url', 'http://localhost:9200'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [SearchService],
  exports:   [SearchService],
})
export class SearchModule {}
