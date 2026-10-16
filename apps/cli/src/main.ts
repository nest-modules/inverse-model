#!/usr/bin/env node
import 'reflect-metadata';
import { CommandFactory } from 'nest-commander';
import { AppModule } from './app.module';

CommandFactory.run(AppModule, ['warn', 'error']);
