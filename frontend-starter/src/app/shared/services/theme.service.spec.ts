import { TestBed } from '@angular/core/testing';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('should initialize with default light theme when localStorage is empty', () => {
    expect(service.isDark()).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('should toggle theme between light and dark', () => {
    service.toggleTheme();
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('makershare-theme')).toBe('dark');

    service.toggleTheme();
    expect(service.isDark()).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(localStorage.getItem('makershare-theme')).toBe('light');
  });

  it('should explicitly set theme', () => {
    service.setTheme(true);
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    service.setTheme(false);
    expect(service.isDark()).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
