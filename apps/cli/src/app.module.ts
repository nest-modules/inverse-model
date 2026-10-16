import { Module } from '@nestjs/common';
import { GenerateCommand } from './commands/generate.command';

@Module({
  providers: [GenerateCommand],
})
export class AppModule {}
