import { logger } from '../utils/logger';
import { AIResponse, ValidationResult, AccuracyMetrics, ValidationConfig } from '../types';

export interface ValidationTestCase {
  id: string;
  input: string;
  expectedCategory: string;
  expectedIntent: string;
  expectedResponse?: string;
  context?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AccuracyReport {
  overallAccuracy: number;
  categoryAccuracy: number;
  intentAccuracy: number;
  responseQuality: number;
  confidenceCalibration: number;
  testCases: ValidationTestCase[];
  results: ValidationResult[];
  metrics: AccuracyMetrics;
  timestamp: Date;
}

export class AccuracyValidator {
  private config: ValidationConfig;
  private testCases: ValidationTestCase[] = [];
  private validationHistory: AccuracyReport[] = [];

  constructor(config: ValidationConfig) {
    this.config = config;
    this.loadTestCases();
  }

  async validateAccuracy(aiResponses: AIResponse[]): Promise<AccuracyReport> {
    logger.info('Starting accuracy validation', {
      testCases: this.testCases.length,
      responses: aiResponses.length,
    });

    const results: ValidationResult[] = [];
    let correctCategories = 0;
    let correctIntents = 0;
    let totalConfidenceError = 0;
    let qualityScores: number[] = [];

    for (const testCase of this.testCases) {
      const aiResponse = aiResponses.find(r => r.inputId === testCase.id);
      if (!aiResponse) {
        logger.warn('No AI response found for test case', { testCaseId: testCase.id });
        continue;
      }

      const result = await this.validateSingleResponse(testCase, aiResponse);
      results.push(result);

      if (result.categoryCorrect) correctCategories++;
      if (result.intentCorrect) correctIntents++;
      
      totalConfidenceError += Math.abs(result.expectedConfidence - result.actualConfidence);
      qualityScores.push(result.responseQuality);
    }

    const metrics = this.calculateMetrics(results);
    const report: AccuracyReport = {
      overallAccuracy: this.calculateOverallAccuracy(results),
      categoryAccuracy: correctCategories / results.length,
      intentAccuracy: correctIntents / results.length,
      responseQuality: qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length,
      confidenceCalibration: 1 - (totalConfidenceError / results.length),
      testCases: this.testCases,
      results,
      metrics,
      timestamp: new Date(),
    };

    this.validationHistory.push(report);
    await this.saveValidationReport(report);

    logger.info('Accuracy validation completed', {
      overallAccuracy: report.overallAccuracy,
      categoryAccuracy: report.categoryAccuracy,
      intentAccuracy: report.intentAccuracy,
      responseQuality: report.responseQuality,
    });

    return report;
  }

  private async validateSingleResponse(
    testCase: ValidationTestCase,
    aiResponse: AIResponse
  ): Promise<ValidationResult> {
    const categoryCorrect = this.validateCategory(testCase.expectedCategory, aiResponse.category);
    const intentCorrect = this.validateIntent(testCase.expectedIntent, aiResponse.intent);
    const responseQuality = await this.evaluateResponseQuality(
      testCase.expectedResponse,
      aiResponse.response,
      testCase.input
    );

    // Calculate expected confidence based on test case difficulty
    const expectedConfidence = this.calculateExpectedConfidence(testCase);
    const actualConfidence = aiResponse.confidence;

    return {
      testCaseId: testCase.id,
      categoryCorrect,
      intentCorrect,
      responseQuality,
      expectedConfidence,
      actualConfidence,
      confidenceCalibrated: Math.abs(expectedConfidence - actualConfidence) < 0.1,
      processingTime: aiResponse.processingTime,
      errors: this.identifyErrors(testCase, aiResponse),
    };
  }

  private validateCategory(expected: string, actual: string): boolean {
    // Normalize categories for comparison
    const normalizeCategory = (cat: string) => cat.toLowerCase().trim();
    return normalizeCategory(expected) === normalizeCategory(actual);
  }

  private validateIntent(expected: string, actual: string): boolean {
    // Use semantic similarity for intent validation
    return this.calculateSemanticSimilarity(expected, actual) > 0.8;
  }

  private async evaluateResponseQuality(
    expected?: string,
    actual?: string,
    input?: string
  ): Promise<number> {
    if (!expected || !actual) return 0.5;

    // Multiple quality metrics
    const relevanceScore = this.calculateRelevance(input || '', actual);
    const accuracyScore = this.calculateSemanticSimilarity(expected, actual);
    const clarityScore = this.evaluateClarity(actual);
    const completenessScore = this.evaluateCompleteness(expected, actual);

    return (relevanceScore + accuracyScore + clarityScore + completenessScore) / 4;
  }

  private calculateSemanticSimilarity(text1: string, text2: string): number {
    // Simple implementation - in production, use more sophisticated NLP
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private calculateRelevance(input: string, response: string): number {
    // Check if response addresses the input
    const inputKeywords = this.extractKeywords(input);
    const responseKeywords = this.extractKeywords(response);
    
    const relevantKeywords = inputKeywords.filter(kw => 
      responseKeywords.some(rw => rw.includes(kw) || kw.includes(rw))
    );
    
    return relevantKeywords.length / Math.max(inputKeywords.length, 1);
  }

  private evaluateClarity(response: string): number {
    // Simple clarity metrics
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = response.length / sentences.length;
    
    // Penalize very long or very short sentences
    const lengthScore = avgSentenceLength > 10 && avgSentenceLength < 100 ? 1 : 0.5;
    
    // Check for clear structure
    const hasStructure = /\b(first|second|third|finally|however|therefore)\b/i.test(response);
    const structureScore = hasStructure ? 1 : 0.7;
    
    return (lengthScore + structureScore) / 2;
  }

  private evaluateCompleteness(expected: string, actual: string): number {
    const expectedPoints = this.extractKeyPoints(expected);
    const actualPoints = this.extractKeyPoints(actual);
    
    const coveredPoints = expectedPoints.filter(ep =>
      actualPoints.some(ap => this.calculateSemanticSimilarity(ep, ap) > 0.6)
    );
    
    return coveredPoints.length / Math.max(expectedPoints.length, 1);
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - in production, use NLP libraries
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));
  }

  private extractKeyPoints(text: string): string[] {
    // Extract sentences that contain key information
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
      .filter(s => /\b(should|must|will|can|need|important|required)\b/i.test(s));
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    ]);
    return stopWords.has(word);
  }

  private calculateExpectedConfidence(testCase: ValidationTestCase): number {
    // Calculate expected confidence based on test case characteristics
    let baseConfidence = 0.8;
    
    // Adjust based on input complexity
    const inputLength = testCase.input.length;
    if (inputLength < 50) baseConfidence += 0.1;
    if (inputLength > 200) baseConfidence -= 0.1;
    
    // Adjust based on context availability
    if (testCase.context && Object.keys(testCase.context).length > 0) {
      baseConfidence += 0.05;
    }
    
    // Adjust based on category difficulty
    const difficultCategories = ['technical_support', 'billing_dispute', 'complex_inquiry'];
    if (difficultCategories.includes(testCase.expectedCategory)) {
      baseConfidence -= 0.15;
    }
    
    return Math.max(0.1, Math.min(1.0, baseConfidence));
  }

  private identifyErrors(testCase: ValidationTestCase, aiResponse: AIResponse): string[] {
    const errors: string[] = [];
    
    if (!this.validateCategory(testCase.expectedCategory, aiResponse.category)) {
      errors.push(`Category mismatch: expected ${testCase.expectedCategory}, got ${aiResponse.category}`);
    }
    
    if (!this.validateIntent(testCase.expectedIntent, aiResponse.intent)) {
      errors.push(`Intent mismatch: expected ${testCase.expectedIntent}, got ${aiResponse.intent}`);
    }
    
    if (aiResponse.confidence < this.config.minimumConfidence) {
      errors.push(`Low confidence: ${aiResponse.confidence} < ${this.config.minimumConfidence}`);
    }
    
    if (aiResponse.processingTime > this.config.maxProcessingTime) {
      errors.push(`Slow processing: ${aiResponse.processingTime}ms > ${this.config.maxProcessingTime}ms`);
    }
    
    return errors;
  }

  private calculateOverallAccuracy(results: ValidationResult[]): number {
    const weights = {
      category: 0.3,
      intent: 0.3,
      quality: 0.3,
      confidence: 0.1,
    };
    
    const categoryAccuracy = results.filter(r => r.categoryCorrect).length / results.length;
    const intentAccuracy = results.filter(r => r.intentCorrect).length / results.length;
    const avgQuality = results.reduce((sum, r) => sum + r.responseQuality, 0) / results.length;
    const confidenceAccuracy = results.filter(r => r.confidenceCalibrated).length / results.length;
    
    return (
      categoryAccuracy * weights.category +
      intentAccuracy * weights.intent +
      avgQuality * weights.quality +
      confidenceAccuracy * weights.confidence
    );
  }

  private calculateMetrics(results: ValidationResult[]): AccuracyMetrics {
    return {
      totalTests: results.length,
      passedTests: results.filter(r => r.categoryCorrect && r.intentCorrect).length,
      averageConfidence: results.reduce((sum, r) => sum + r.actualConfidence, 0) / results.length,
      averageProcessingTime: results.reduce((sum, r) => sum + r.processingTime, 0) / results.length,
      errorRate: results.filter(r => r.errors.length > 0).length / results.length,
      categoryDistribution: this.calculateCategoryDistribution(results),
      confidenceDistribution: this.calculateConfidenceDistribution(results),
    };
  }

  private calculateCategoryDistribution(results: ValidationResult[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const result of results) {
      const testCase = this.testCases.find(tc => tc.id === result.testCaseId);
      if (testCase) {
        distribution[testCase.expectedCategory] = (distribution[testCase.expectedCategory] || 0) + 1;
      }
    }
    
    return distribution;
  }

  private calculateConfidenceDistribution(results: ValidationResult[]): Record<string, number> {
    const ranges = {
      'low (0-0.3)': 0,
      'medium (0.3-0.7)': 0,
      'high (0.7-1.0)': 0,
    };
    
    for (const result of results) {
      if (result.actualConfidence < 0.3) ranges['low (0-0.3)']++;
      else if (result.actualConfidence < 0.7) ranges['medium (0.3-0.7)']++;
      else ranges['high (0.7-1.0)']++;
    }
    
    return ranges;
  }

  private async loadTestCases(): Promise<void> {
    // Load test cases from database or file
    // This is a simplified implementation
    this.testCases = [
      {
        id: 'test-1',
        input: 'Where is my order #12345?',
        expectedCategory: 'order_inquiry',
        expectedIntent: 'track_order',
        expectedResponse: 'Let me help you track your order #12345.',
      },
      {
        id: 'test-2',
        input: 'I want to return this product because it doesn\'t fit',
        expectedCategory: 'return_request',
        expectedIntent: 'initiate_return',
        expectedResponse: 'I can help you start the return process for your product.',
      },
      // Add more test cases...
    ];
  }

  private async saveValidationReport(report: AccuracyReport): Promise<void> {
    // Save report to database
    logger.info('Validation report saved', {
      reportId: `report-${report.timestamp.getTime()}`,
      accuracy: report.overallAccuracy,
    });
  }

  async getValidationHistory(): Promise<AccuracyReport[]> {
    return this.validationHistory;
  }

  async addTestCase(testCase: ValidationTestCase): Promise<void> {
    this.testCases.push(testCase);
    logger.info('Test case added', { testCaseId: testCase.id });
  }

  async removeTestCase(testCaseId: string): Promise<void> {
    this.testCases = this.testCases.filter(tc => tc.id !== testCaseId);
    logger.info('Test case removed', { testCaseId });
  }

  getRequiredAccuracy(): number {
    return this.config.targetAccuracy || 0.9;
  }

  isAccuracyMet(report: AccuracyReport): boolean {
    return report.overallAccuracy >= this.getRequiredAccuracy();
  }
}
