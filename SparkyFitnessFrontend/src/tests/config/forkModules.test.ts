import {
  getModuleIdForPath,
  isPathAllowedByModules,
} from '@/config/forkModules';
import { resolveForkModuleMap } from '@workspace/shared';

describe('forkModules helpers', () => {
  it('resolves defaults when stored map is empty', () => {
    expect(resolveForkModuleMap({})).toEqual({
      exercises: true,
      medications: true,
      training_plan: false,
    });
  });

  it('applies stored overrides', () => {
    expect(
      resolveForkModuleMap({ exercises: false, training_plan: true })
    ).toEqual({
      exercises: false,
      medications: true,
      training_plan: true,
    });
  });

  it('maps exercise routes to the exercises module', () => {
    expect(getModuleIdForPath('/exercises')).toBe('exercises');
    expect(getModuleIdForPath('/exercises/foo')).toBe('exercises');
    expect(getModuleIdForPath('/workout-playback')).toBe('exercises');
  });

  it('maps medication routes to the medications module', () => {
    expect(getModuleIdForPath('/medications')).toBe('medications');
    expect(getModuleIdForPath('/medications/log')).toBe('medications');
  });

  it('allows unrelated paths', () => {
    expect(getModuleIdForPath('/')).toBeUndefined();
    expect(getModuleIdForPath('/settings')).toBeUndefined();
    expect(isPathAllowedByModules('/foods', { exercises: false })).toBe(true);
  });

  it('blocks disabled module paths', () => {
    expect(
      isPathAllowedByModules('/exercises', { exercises: false })
    ).toBe(false);
    expect(
      isPathAllowedByModules('/medications', { medications: false })
    ).toBe(false);
    expect(
      isPathAllowedByModules('/exercises', { exercises: true })
    ).toBe(true);
  });
});
