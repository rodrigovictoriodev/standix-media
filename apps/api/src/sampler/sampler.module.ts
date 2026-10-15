import { Module } from "@nestjs/common";
import { SamplerController } from "./sampler.controller";
import { SamplerService } from "./sampler.service";

@Module({
  controllers: [SamplerController],
  providers: [SamplerService],
  exports: [SamplerService],
})
export class SamplerModule {}
