#!/usr/bin/env node

/**
 * Performance Testing Suite Runner
 * Orchestrates comprehensive performance testing including load, stress, and endurance tests
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const PerformanceMonitor = require('./monitor-performance');

class PerformanceTestRunner {
  constructor() {
    this.testResults = [];
    this.monitor = new PerformanceMonitor();
    this.reportsDir = path.join(__dirname, 'reports');
    this.testsDir = path.join(__dirname, 'load-tests');
  }

  /**
   * Run complete performance test suite
   */
  async runFullSuite() {
    console.log('🚀 Starting Complete Performance Test Suite');
    console.log('==========================================\n');

    // Ensure directories exist
    this.ensureDirectories();

    // Check if services are running
    await this.checkServices();

    // Run test sequence
    const tests = [
      { name: 'Baseline Test', config: 'baseline-test.yml', duration: '10 minutes' },
      { name: 'Load Test', config: 'load-test.yml', duration: '30 minutes' },
      { name: 'Stress Test', config: 'stress-test.yml', duration: '20 minutes' },
      { name: 'Spike Test', config: 'spike-test.yml', duration: '10 minutes' },
    ];

    for (const test of tests) {
      console.log(`\n📊 Running ${test.name} (${test.duration})...`);
      await this.runSingleTest(test);
      
      // Wait between tests
      console.log('⏳ Waiting 2 minutes before next test...');
      await this.sleep(120000);
    }

    // Generate final report
    await this.generateFinalReport();
    
    console.log('\n✅ Performance Test Suite Completed!');
  }

  /**
   * Run a single performance test
   */
  async runSingleTest(test) {
    const testStart = Date.now();
    
    try {
      // Start performance monitoring
      console.log('📈 Starting performance monitoring...');
      await this.monitor.startMonitoring(5000);

      // Run Artillery test
      console.log(`🎯 Executing ${test.name}...`);
      const result = await this.runArtilleryTest(test.config);
      
      // Stop monitoring
      this.monitor.stopMonitoring();
      
      // Record results
      const testResult = {
        name: test.name,
        config: test.config,
        duration: Date.now() - testStart,
        success: result.success,
        metrics: result.metrics,
        timestamp: new Date().toISOString(),
      };
      
      this.testResults.push(testResult);
      
      // Log results
      this.logTestResult(testResult);
      
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error.message);
      
      this.testResults.push({
        name: test.name,
        config: test.config,
        duration: Date.now() - testStart,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Run Artillery load test
   */
  runArtilleryTest(configFile) {
    return new Promise((resolve, reject) => {
      const configPath = path.join(this.testsDir, configFile);
      
      if (!fs.existsSync(configPath)) {
        reject(new Error(`Test configuration not found: ${configPath}`));
        return;
      }

      const artillery = spawn('npx', ['artillery', 'run', configPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(configPath),
      });

      let output = '';
      let errorOutput = '';

      artillery.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        process.stdout.write(chunk); // Real-time output
      });

      artillery.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        process.stderr.write(chunk);
      });

      artillery.on('close', (code) => {
        if (code === 0) {
          const metrics = this.parseArtilleryOutput(output);
          resolve({
            success: true,
            metrics,
            output,
          });
        } else {
          reject(new Error(`Artillery test failed with code ${code}: ${errorOutput}`));
        }
      });

      artillery.on('error', (error) => {
        reject(new Error(`Failed to start Artillery: ${error.message}`));
      });
    });
  }

  /**
   * Parse Artillery output for metrics
   */
  parseArtilleryOutput(output) {
    const metrics = {
      scenarios: 0,
      requests: 0,
      responses: 0,
      errors: 0,
      responseTime: {},
      throughput: 0,
    };

    try {
      // Extract key metrics from Artillery output
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.includes('scenarios launched:')) {
          metrics.scenarios = parseInt(line.match(/(\d+)/)?.[1] || '0');
        }
        
        if (line.includes('scenarios completed:')) {
          metrics.completed = parseInt(line.match(/(\d+)/)?.[1] || '0');
        }
        
        if (line.includes('requests completed:')) {
          metrics.requests = parseInt(line.match(/(\d+)/)?.[1] || '0');
        }
        
        if (line.includes('Response time')) {
          const match = line.match(/min: ([\d.]+).*max: ([\d.]+).*median: ([\d.]+).*p95: ([\d.]+).*p99: ([\d.]+)/);
          if (match) {
            metrics.responseTime = {
              min: parseFloat(match[1]),
              max: parseFloat(match[2]),
              median: parseFloat(match[3]),
              p95: parseFloat(match[4]),
              p99: parseFloat(match[5]),
            };
          }
        }
        
        if (line.includes('RPS:')) {
          const match = line.match(/RPS: ([\d.]+)/);
          if (match) {
            metrics.throughput = parseFloat(match[1]);
          }
        }
      }
      
    } catch (error) {
      console.warn('⚠️  Could not parse all Artillery metrics:', error.message);
    }

    return metrics;
  }

  /**
   * Check if required services are running
   */
  async checkServices() {
    console.log('🔍 Checking service availability...');
    
    const services = [
      { name: 'API Gateway', url: 'http://localhost:3000/health' },
      { name: 'AI Service', url: 'http://localhost:3001/health' },
      { name: 'Integration Service', url: 'http://localhost:3002/health' },
    ];

    for (const service of services) {
      try {
        await this.checkServiceHealth(service.url);
        console.log(`✅ ${service.name} is running`);
      } catch (error) {
        console.warn(`⚠️  ${service.name} may not be running: ${error.message}`);
      }
    }
    
    console.log('');
  }

  /**
   * Check individual service health
   */
  checkServiceHealth(url) {
    return new Promise((resolve, reject) => {
      exec(`curl -f -s ${url}`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Service not responding: ${error.message}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  /**
   * Log test result summary
   */
  logTestResult(result) {
    console.log(`\n📋 ${result.name} Results:`);
    console.log('========================');
    console.log(`Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Duration: ${Math.round(result.duration / 1000)}s`);
    
    if (result.metrics) {
      console.log(`Scenarios: ${result.metrics.scenarios || 0}`);
      console.log(`Requests: ${result.metrics.requests || 0}`);
      console.log(`Throughput: ${result.metrics.throughput || 0} RPS`);
      
      if (result.metrics.responseTime) {
        console.log(`Response Time - Median: ${result.metrics.responseTime.median}ms, P95: ${result.metrics.responseTime.p95}ms`);
      }
    }
  }

  /**
   * Generate final comprehensive report
   */
  async generateFinalReport() {
    console.log('\n📊 Generating Final Performance Report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.testResults.length,
        passedTests: this.testResults.filter(t => t.success).length,
        failedTests: this.testResults.filter(t => !t.success).length,
        totalDuration: this.testResults.reduce((sum, t) => sum + t.duration, 0),
      },
      testResults: this.testResults,
      performanceAnalysis: this.analyzePerformance(),
      recommendations: this.generateRecommendations(),
    };

    // Save report
    const reportFile = path.join(this.reportsDir, `performance-suite-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // Generate HTML report
    await this.generateHTMLReport(report, reportFile.replace('.json', '.html'));

    console.log(`📋 Final report saved: ${reportFile}`);
    
    // Print summary
    this.printFinalSummary(report);
  }

  /**
   * Analyze overall performance
   */
  analyzePerformance() {
    const analysis = {
      overallHealth: 'good',
      criticalIssues: [],
      warnings: [],
      strengths: [],
    };

    // Analyze each test result
    for (const result of this.testResults) {
      if (!result.success) {
        analysis.criticalIssues.push(`${result.name} failed: ${result.error}`);
        analysis.overallHealth = 'poor';
        continue;
      }

      if (result.metrics?.responseTime) {
        const rt = result.metrics.responseTime;
        
        if (rt.p95 > 1000) {
          analysis.criticalIssues.push(`${result.name}: P95 response time too high (${rt.p95}ms)`);
          analysis.overallHealth = 'poor';
        } else if (rt.p95 > 500) {
          analysis.warnings.push(`${result.name}: P95 response time elevated (${rt.p95}ms)`);
          if (analysis.overallHealth === 'good') analysis.overallHealth = 'fair';
        } else {
          analysis.strengths.push(`${result.name}: Good response times (P95: ${rt.p95}ms)`);
        }
      }

      if (result.metrics?.throughput) {
        if (result.metrics.throughput > 100) {
          analysis.strengths.push(`${result.name}: Good throughput (${result.metrics.throughput} RPS)`);
        }
      }
    }

    return analysis;
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const analysis = this.analyzePerformance();

    if (analysis.overallHealth === 'poor') {
      recommendations.push('CRITICAL: Address failed tests and high response times before production deployment');
      recommendations.push('Consider horizontal scaling and performance optimization');
    }

    if (analysis.overallHealth === 'fair') {
      recommendations.push('Optimize response times, particularly for high-load scenarios');
      recommendations.push('Consider implementing caching and database optimization');
    }

    if (analysis.criticalIssues.length === 0 && analysis.warnings.length === 0) {
      recommendations.push('System performance meets production requirements');
      recommendations.push('Consider implementing continuous performance monitoring');
    }

    return recommendations;
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(report, htmlFile) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e8f4f8; padding: 15px; border-radius: 5px; flex: 1; }
        .test-result { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .passed { border-left: 5px solid #4CAF50; }
        .failed { border-left: 5px solid #f44336; }
        .recommendations { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Test Report</h1>
        <p>Generated: ${report.timestamp}</p>
        <p>Overall Health: <strong>${this.analyzePerformance().overallHealth.toUpperCase()}</strong></p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <h3>Total Tests</h3>
            <p>${report.summary.totalTests}</p>
        </div>
        <div class="metric">
            <h3>Passed</h3>
            <p>${report.summary.passedTests}</p>
        </div>
        <div class="metric">
            <h3>Failed</h3>
            <p>${report.summary.failedTests}</p>
        </div>
        <div class="metric">
            <h3>Duration</h3>
            <p>${Math.round(report.summary.totalDuration / 1000 / 60)}m</p>
        </div>
    </div>
    
    <h2>Test Results</h2>
    ${report.testResults.map(result => `
        <div class="test-result ${result.success ? 'passed' : 'failed'}">
            <h3>${result.name} ${result.success ? '✅' : '❌'}</h3>
            <p><strong>Duration:</strong> ${Math.round(result.duration / 1000)}s</p>
            ${result.metrics ? `
                <p><strong>Requests:</strong> ${result.metrics.requests || 0}</p>
                <p><strong>Throughput:</strong> ${result.metrics.throughput || 0} RPS</p>
                ${result.metrics.responseTime ? `
                    <p><strong>Response Time:</strong> P95: ${result.metrics.responseTime.p95}ms, Median: ${result.metrics.responseTime.median}ms</p>
                ` : ''}
            ` : ''}
            ${result.error ? `<p><strong>Error:</strong> ${result.error}</p>` : ''}
        </div>
    `).join('')}
    
    <div class="recommendations">
        <h2>Recommendations</h2>
        <ul>
            ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;

    fs.writeFileSync(htmlFile, html);
  }

  /**
   * Print final summary to console
   */
  printFinalSummary(report) {
    console.log('\n🎯 PERFORMANCE TEST SUITE SUMMARY');
    console.log('==================================');
    console.log(`Overall Health: ${this.analyzePerformance().overallHealth.toUpperCase()}`);
    console.log(`Tests Passed: ${report.summary.passedTests}/${report.summary.totalTests}`);
    console.log(`Total Duration: ${Math.round(report.summary.totalDuration / 1000 / 60)} minutes`);
    
    console.log('\n📋 Key Recommendations:');
    report.recommendations.forEach(rec => console.log(`   • ${rec}`));
    
    console.log('\n✅ Performance testing complete!');
  }

  /**
   * Ensure required directories exist
   */
  ensureDirectories() {
    [this.reportsDir, this.testsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI interface
if (require.main === module) {
  const runner = new PerformanceTestRunner();
  
  const command = process.argv[2] || 'full';
  
  if (command === 'full') {
    runner.runFullSuite().catch(console.error);
  } else {
    console.log('Usage: node run-performance-tests.js [full]');
  }
}

module.exports = PerformanceTestRunner;
