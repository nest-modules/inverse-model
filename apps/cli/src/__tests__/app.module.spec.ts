import 'reflect-metadata';
import { AppModule } from '../app.module';
import { GenerateCommand } from '../commands/generate.command';

describe('AppModule', () => {
  it('provides the generate command', () => {
    expect(Reflect.getMetadata('providers', AppModule)).toEqual([
      GenerateCommand,
    ]);
  });
});
