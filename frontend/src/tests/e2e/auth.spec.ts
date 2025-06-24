import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
  });

  test('should display login page correctly', async ({ page }) => {
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();
    
    await expect(page.getByText('Please enter a valid email address')).toBeVisible();
    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.getByText('create a new account').click();
    await expect(page).toHaveURL(/\/auth\/register/);
    await expect(page.getByText('Create your account')).toBeVisible();
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.getByText('Forgot your password?').click();
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
    await expect(page.getByText('Forgot your password?')).toBeVisible();
  });

  test('should attempt login with valid credentials', async ({ page }) => {
    // Mock the API response
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: '1', email: 'test@example.com', firstName: 'Test', lastName: 'User' },
          organization: { id: '1', name: 'Test Org' },
          tokens: {
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 3600,
          },
        }),
      });
    });

    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('should handle login error', async ({ page }) => {
    // Mock the API error response
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Invalid credentials',
        }),
      });
    });

    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });
});

test.describe('Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/register');
  });

  test('should display registration form correctly', async ({ page }) => {
    await expect(page.getByText('Create your account')).toBeVisible();
    await expect(page.getByLabel('First name')).toBeVisible();
    await expect(page.getByLabel('Last name')).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Organization name')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.getByRole('button', { name: /create account/i }).click();
    
    await expect(page.getByText('First name must be at least 2 characters')).toBeVisible();
    await expect(page.getByText('Last name must be at least 2 characters')).toBeVisible();
    await expect(page.getByText('Please enter a valid email address')).toBeVisible();
  });

  test('should show password mismatch error', async ({ page }) => {
    await page.getByLabel('First name').fill('John');
    await page.getByLabel('Last name').fill('Doe');
    await page.getByLabel('Email address').fill('john@example.com');
    await page.getByLabel('Organization name').fill('Test Org');
    await page.getByLabel('Password').fill('password123');
    await page.getByLabel('Confirm password').fill('differentpassword');
    
    await page.getByRole('button', { name: /create account/i }).click();
    
    await expect(page.getByText("Passwords don't match")).toBeVisible();
  });

  test('should require terms agreement', async ({ page }) => {
    await page.getByLabel('First name').fill('John');
    await page.getByLabel('Last name').fill('Doe');
    await page.getByLabel('Email address').fill('john@example.com');
    await page.getByLabel('Organization name').fill('Test Org');
    await page.getByLabel('Password').fill('password123');
    await page.getByLabel('Confirm password').fill('password123');
    
    await page.getByRole('button', { name: /create account/i }).click();
    
    await expect(page.getByText('You must agree to the terms and conditions')).toBeVisible();
  });

  test('should successfully register with valid data', async ({ page }) => {
    // Mock the API response
    await page.route('**/api/auth/register', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: '1', email: 'john@example.com', firstName: 'John', lastName: 'Doe' },
          organization: { id: '1', name: 'Test Org' },
          tokens: {
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            expiresIn: 3600,
          },
        }),
      });
    });

    await page.getByLabel('First name').fill('John');
    await page.getByLabel('Last name').fill('Doe');
    await page.getByLabel('Email address').fill('john@example.com');
    await page.getByLabel('Organization name').fill('Test Org');
    await page.getByLabel('Password').fill('password123');
    await page.getByLabel('Confirm password').fill('password123');
    await page.getByLabel(/I agree to the/).check();
    
    await page.getByRole('button', { name: /create account/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('Protected Routes', () => {
  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should redirect to login when accessing conversations without auth', async ({ page }) => {
    await page.goto('/conversations');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should redirect to login when accessing settings without auth', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('Navigation', () => {
  test('should redirect root to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should handle 404 pages', async ({ page }) => {
    await page.goto('/non-existent-page');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText('Page Not Found')).toBeVisible();
  });
});
