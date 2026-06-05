import { Global, Module } from '@nestjs/common';
import { EventProcessingPipeline } from './pipeline.service';
import { NormalizationStage } from './stages/normalization.stage';
import { EnrichmentStage } from './stages/enrichment.stage';
import { FingerprintStage } from './stages/fingerprint.stage';
import { RoutingStage } from './stages/routing.stage';

const STAGES = [
  NormalizationStage,
  EnrichmentStage,
  FingerprintStage,
  RoutingStage,
];

@Global()
@Module({
  providers: [...STAGES, EventProcessingPipeline],
  exports:   [EventProcessingPipeline],
})
export class PipelineModule {}
