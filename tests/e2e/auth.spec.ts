import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('should redirect to login page when not authenticated', async ({ page }) => {
    // Should be redirected to login page
    await expect(page).toHaveURL(/.*\/auth\/login/);
    
    // Check login form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for invalid login', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Try to submit empty form
    await page.click('button[type="submit"]');
    
    // Should show validation errors
    await expect(page.locator('text=Email is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Fill in invalid credentials
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('should successfully register a new user', async ({ page }) => {
    await page.goto('/auth/register');
    
    const timestamp = Date.now();
    const email = `test-${timestamp}@example.com`;
    
    // Fill in registration form
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.fill('input[name="confirmPassword"]', 'TestPassword123!');
    await page.fill('input[name="organizationName"]', 'Test Organization');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Should show welcome message or user info
    await expect(page.locator('text=Test User')).toBeVisible();
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // First register a user
    await page.goto('/auth/register');
    
    const timestamp = Date.now();
    const email = `login-test-${timestamp}@example.com`;
    const password = 'TestPassword123!';
    
    await page.fill('input[name="firstName"]', 'Login');
    await page.fill('input[name="lastName"]', 'Test');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="confirmPassword"]', password);
    await page.fill('input[name="organizationName"]', 'Login Test Org');
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('text=Logout');
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*\/auth\/login/);
    
    // Now login with the same credentials
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('text=Login Test')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Register and login first
    await page.goto('/auth/register');
    
    const timestamp = Date.now();
    const email = `logout-test-${timestamp}@example.com`;
    
    await page.fill('input[name="firstName"]', 'Logout');
    await page.fill('input[name="lastName"]', 'Test');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.fill('input[name="confirmPassword"]', 'TestPassword123!');
    await page.fill('input[name="organizationName"]', 'Logout Test Org');
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('text=Logout');
    
    // Should redirect to login page
    await expect(page).toHaveURL(/.*\/auth\/login/);
    
    // Should not be able to access protected routes
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*\/auth\/login/);
  });

  test('should handle password reset flow', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Click forgot password link
    await page.click('text=Forgot password?');
    await expect(page).toHaveURL(/.*\/auth\/forgot-password/);
    
    // Fill in email
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    
    // Should show success message
    await expect(page.locator('text=Reset link sent')).toBeVisible();
  });

  test('should navigate between auth pages', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Go to register page
    await page.click('text=Create account');
    await expect(page).toHaveURL(/.*\/auth\/register/);
    
    // Go back to login page
    await page.click('text=Sign in');
    await expect(page).toHaveURL(/.*\/auth\/login/);
    
    // Go to forgot password page
    await page.click('text=Forgot password?');
    await expect(page).toHaveURL(/.*\/auth\/forgot-password/);
    
    // Go back to login page
    await page.click('text=Back to login');
    await expect(page).toHaveURL(/.*\/auth\/login/);
  });
});
